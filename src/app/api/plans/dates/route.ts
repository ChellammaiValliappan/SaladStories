import { pickableDates } from "@/lib/plans";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Calendar for "Pick your days". */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slotId = url.searchParams.get("slotId");
  const plan = url.searchParams.get("plan") ?? "CUSTOM";
  if (!slotId) return fail("Choose a delivery time.");
  return ok({ dates: await pickableDates(slotId, plan) });
}
