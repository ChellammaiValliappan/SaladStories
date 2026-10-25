import { getInvoiceByToken } from "@/lib/biz/invoices";
import { invoicePdf } from "@/lib/biz/invoice-pdf";

export const dynamic = "force-dynamic";

/** Customer's private invoice link → PDF. The token is the only key, so it's long and random. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const found = await getInvoiceByToken((await params).token);
  if (!found || found.inv.status === "VOID") return new Response("Not found", { status: 404 });
  const bytes = await invoicePdf(found.inv, found.money.payments, found.related, found.money);
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${found.inv.number.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
