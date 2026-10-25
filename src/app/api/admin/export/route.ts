import { getCurrentUser } from "@/lib/auth";
import { EXPORT_TYPES, exportSheets, toCsv, toXlsx, type ExportType } from "@/lib/biz/exports";
import { audit } from "@/lib/biz/audit";
import { db } from "@/db";
import { addDays, istParts } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Admin downloads: ?type=payments|invoices|expenses|customers|plans|orders|finance&format=csv|xlsx&from=&to= */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as ExportType;
  if (!EXPORT_TYPES.includes(type)) return new Response("Unknown export", { status: 400 });
  const today = istParts().dateStr;
  const valid = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const from = valid(url.searchParams.get("from")) ?? addDays(today, -29);
  const to = valid(url.searchParams.get("to")) ?? today;
  const xlsx = url.searchParams.get("format") === "xlsx";
  const sheets = await exportSheets(type, from, to);
  await audit(db, "export", type, "downloaded", { after: { from, to, format: xlsx ? "xlsx" : "csv" }, actor: { id: user.id, name: user.name } });
  const base = `salad-stories-${type}-${type === "customers" ? today : `${from}-to-${to}`}`;
  return xlsx
    ? new Response(new Uint8Array(await toXlsx(sheets)), {
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" },
      })
    : new Response(toCsv(sheets), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" },
      });
}
