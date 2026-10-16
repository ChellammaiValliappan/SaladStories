"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { addresses, db, users } from "@/db";
import { destroySession, getCurrentUser } from "@/lib/auth";

async function me() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  return user;
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^([6-9]\d{9})?$/),
});

export async function updateProfile(_: unknown, form: FormData) {
  const user = await me();
  const parsed = profileSchema.safeParse({ name: form.get("name"), phone: form.get("phone") });
  if (!parsed.success) return { error: "Check your name and 10-digit mobile number." };
  await db.update(users).set({ name: parsed.data.name, phone: parsed.data.phone || null }).where(eq(users.id, user.id));
  revalidatePath("/account");
  return { ok: "Profile saved." };
}

const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  house: z.string().trim().min(1, "Enter a house or flat number").max(80),
  building: z.string().trim().max(120),
  street: z.string().trim().max(120),
  area: z.string().trim().min(2, "Enter an area").max(80),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"),
  landmark: z.string().trim().max(120),
  instructions: z.string().trim().max(300),
});

export async function saveAddress(_: unknown, form: FormData) {
  const user = await me();
  const raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = addressSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  if (id) await db.update(addresses).set(data).where(and(eq(addresses.id, id), eq(addresses.userId, user.id)));
  else {
    const existing = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, user.id));
    await db.insert(addresses).values({ ...data, userId: user.id, isDefault: existing.length === 0 });
  }
  revalidatePath("/account");
  return { ok: "Address saved." };
}

export async function deleteAddress(form: FormData) {
  const user = await me();
  await db.delete(addresses).where(and(eq(addresses.id, String(form.get("id"))), eq(addresses.userId, user.id)));
  revalidatePath("/account");
}

export async function makeDefault(form: FormData) {
  const user = await me();
  await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
  await db.update(addresses).set({ isDefault: true }).where(and(eq(addresses.id, String(form.get("id"))), eq(addresses.userId, user.id)));
  revalidatePath("/account");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}
