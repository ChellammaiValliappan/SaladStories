import { getCurrentUser, isTeam } from "@/lib/auth";
import { receiptContext } from "@/lib/biz/receipt-context";
import { receiptPdf } from "@/lib/biz/invoice-pdf";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !isTeam(u.role)) return new Response("Please log in.", { status: 401 });
  const r = await receiptContext((await params).id);
  if (!r) return new Response("Not found", { status: 404 });
  const bytes = await receiptPdf(r.p, r.ctx);
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${r.p.receiptNo}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
