import { getInvoiceByToken } from "@/lib/biz/invoices";
import { receiptContext } from "@/lib/biz/receipt-context";
import { receiptPdf } from "@/lib/biz/invoice-pdf";

export const dynamic = "force-dynamic";

/** A receipt, only reachable through its invoice's private link. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const found = await getInvoiceByToken(token);
  if (!found || !found.money.payments.some((p) => p.id === id && p.status === "RECEIVED")) return new Response("Not found", { status: 404 });
  const r = await receiptContext(id);
  if (!r) return new Response("Not found", { status: 404 });
  const bytes = await receiptPdf(r.p, r.ctx);
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.p.receiptNo}.pdf"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
