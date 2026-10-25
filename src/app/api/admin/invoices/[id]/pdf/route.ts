import { getCurrentUser, isTeam } from "@/lib/auth";
import { getInvoice } from "@/lib/biz/invoices";
import { invoicePdf } from "@/lib/biz/invoice-pdf";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !isTeam(u.role)) return new Response("Please log in.", { status: 401 });
  const found = await getInvoice((await params).id);
  if (!found) return new Response("Not found", { status: 404 });
  const bytes = await invoicePdf(found.inv, found.money.payments, found.related, found.money);
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${found.inv.number.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
