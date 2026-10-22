import { asc, eq } from "drizzle-orm";
import { db, deliverySlots } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { slotLabelOf } from "@/lib/plans";
import { saveCustomer } from "../../../biz-actions";
import { Card, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { CustomerFields } from "@/components/admin/biz/CustomerFields";

export const metadata = { title: "Add customer" };

export default async function NewCustomer({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const slots = await db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true)).orderBy(asc(deliverySlots.sortOrder));
  return (
    <>
      <PageHead title="Add customer" back={{ href: "/admin/customers", label: "Customers" }} />
      <Flash err={sp.err} />
      <form action={saveCustomer}>
        <Card>
          <CustomerFields slots={slots.map((s) => ({ id: s.id, label: slotLabelOf(s) }))} />
        </Card>
        <div className="mt-5 flex flex-wrap gap-3">
          <SubmitButton className="btn btn-primary">Save customer</SubmitButton>
          <button name="next" value="subscription" className="btn btn-ghost">Save and create a plan</button>
        </div>
      </form>
    </>
  );
}
