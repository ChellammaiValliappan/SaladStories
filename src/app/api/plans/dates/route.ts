import { pickableDates } from "@/lib/plans";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Calendar for "Pick your days". */
export async function GET(req: Request) {
  const slotId = new URL(req.url).searchParams.get("slotId");
  if (!slotId) return fail("Choose a delivery time.");
  return ok({ dates: await pickableDates(slotId) });
}
