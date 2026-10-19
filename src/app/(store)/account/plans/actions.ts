"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isTeam } from "@/lib/auth";
import { CheckoutError } from "@/lib/orders";
import { changePlanDay, skipPlanDay } from "@/lib/plans";
import { formatDateLong } from "@/lib/time";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function actor() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/plans");
  return { userId: user.id, isTeam: isTeam(user.role) };
}

function back(number: string, q: string): never {
  revalidatePath(`/account/plans/${number}`);
  redirect(`/account/plans/${number}?${q}`);
}

export async function swapDay(form: FormData) {
  const a = await actor();
  const number = str(form, "number");
  try {
    await changePlanDay(str(form, "subscriptionId"), str(form, "dayId"), str(form, "productId"), a);
  } catch (e) {
    if (e instanceof CheckoutError) back(number, `err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  back(number, "msg=swapped");
}

export async function skipDay(form: FormData) {
  const a = await actor();
  const number = str(form, "number");
  let moved = "";
  try {
    moved = await skipPlanDay(str(form, "subscriptionId"), str(form, "dayId"), a);
  } catch (e) {
    if (e instanceof CheckoutError) back(number, `err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  back(number, `msg=${encodeURIComponent(`Skipped. That bowl now comes on ${formatDateLong(moved)}.`)}`);
}
