import crypto from "crypto";
import { sendDailySummary, sendOrdersBackup } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Shared secret the scheduled Netlify functions send (CRON_SECRET, or AUTH_SECRET if unset). */
function authorised(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.AUTH_SECRET || "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 16 || got.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/** Called by netlify/functions/*.mts on a schedule. */
export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorised(req)) return Response.json({ error: "Not allowed" }, { status: 401 });
  const { job } = await params;
  if (job === "daily-summary") return Response.json(await sendDailySummary());
  if (job === "weekly-backup") return Response.json(await sendOrdersBackup());
  return Response.json({ error: "Unknown job" }, { status: 404 });
}
