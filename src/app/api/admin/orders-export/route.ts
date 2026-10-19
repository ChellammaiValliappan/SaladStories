import { getCurrentUser } from "@/lib/auth";
import { ordersCsv } from "@/lib/reports";
import { addDays, istParts } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Admin-only download of orders as CSV (opens in Excel / Google Sheets). ?all=1 = every order. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed", { status: 403 });

  const url = new URL(req.url);
  const today = istParts().dateStr;
  const valid = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const all = url.searchParams.get("all") === "1";
  const from = valid(url.searchParams.get("from")) ?? addDays(today, -29);
  const to = valid(url.searchParams.get("to")) ?? today;

  const { csv } = all ? await ordersCsv() : await ordersCsv(from, to);
  const name = all ? `salad-stories-all-orders-${today}.csv` : `salad-stories-orders-${from}-to-${to}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
