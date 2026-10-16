import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { asc, count, desc, eq } from "drizzle-orm";
import { categories, couponRedemptions, coupons, db, deliveryAreas, products } from "@/db";
import { formatINR } from "@/lib/money";
import { deleteCoupon, saveCoupon, toggleCoupon } from "../../actions";
import { Badge, Card, Check, Empty, Field, PageHead, Select, Table } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata = { title: "Coupons" };

const istDate = (d: Date | null) => (d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10) : "");

function describe(c: typeof coupons.$inferSelect) {
  const what = c.type === "PERCENT" ? `${c.value}% off${c.maxDiscount ? ` (max ${formatINR(c.maxDiscount)})` : ""}` : c.type === "FLAT" ? `${formatINR(c.value)} off` : "Free delivery";
  const rules = [c.minOrder && `min ${formatINR(c.minOrder)}`, c.firstOrderOnly && "first order", c.productIds.length && "selected items", c.categoryIds.length && "selected categories", c.areaIds.length && "selected areas"].filter(Boolean);
  return rules.length ? `${what} · ${rules.join(", ")}` : what;
}

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ edit?: string; msg?: string; err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [rows, used, prods, cats, areas] = await Promise.all([
    db.select().from(coupons).orderBy(desc(coupons.isActive), asc(coupons.code)),
    db.select({ couponId: couponRedemptions.couponId, n: count() }).from(couponRedemptions).where(eq(couponRedemptions.status, "REDEEMED")).groupBy(couponRedemptions.couponId),
    db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)),
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select({ id: deliveryAreas.id, name: deliveryAreas.name }).from(deliveryAreas),
  ]);
  const editing = sp.edit === "new" ? null : rows.find((r) => r.id === sp.edit);
  const showForm = sp.edit === "new" || !!editing;
  const c = editing;
  const now = new Date();

  return (
    <>
      <PageHead title="Coupons">
        <Link href="/admin/coupons?edit=new" className="btn btn-primary min-h-11">Create a coupon</Link>
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />

      {showForm && (
        <Card title={c ? `Edit ${c.code}` : "New coupon"} className="mb-6">
          <form action={saveCoupon} className="grid gap-4 md:grid-cols-3">
            {c && <input type="hidden" name="id" value={c.id} />}
            <Field label="Code" name="code" defaultValue={c?.code} required placeholder="e.g. WELCOME10" />
            <Select label="Discount type" name="type" defaultValue={c?.type ?? "PERCENT"} options={[{ value: "PERCENT", label: "Percentage off" }, { value: "FLAT", label: "Fixed amount off (₹)" }, { value: "FREE_DELIVERY", label: "Free delivery" }]} />
            <Field label="Value" name="value" type="number" step="0.01" defaultValue={c ? (c.type === "FLAT" ? c.value / 100 : c.value) : ""} hint="Percent, or ₹ for fixed. Ignored for free delivery." />
            <Field label="Description (shown to customers)" name="description" defaultValue={c?.description} className="md:col-span-3" />
            <Field label="Maximum discount (₹)" name="maxDiscount" type="number" step="0.01" defaultValue={c?.maxDiscount != null ? c.maxDiscount / 100 : ""} hint="Caps percentage coupons." />
            <Field label="Minimum order (₹)" name="minOrder" type="number" step="0.01" defaultValue={c?.minOrder != null ? c.minOrder / 100 : ""} />
            <Field label="Campaign name" name="campaign" defaultValue={c?.campaign} hint="For your reports, e.g. Diwali 2026" />
            <Field label="Starts on" name="startsAt" type="date" defaultValue={istDate(c?.startsAt ?? null)} />
            <Field label="Expires on" name="expiresAt" type="date" defaultValue={istDate(c?.expiresAt ?? null)} />
            <div />
            <Field label="Total uses allowed" name="totalLimit" type="number" defaultValue={c?.totalLimit} hint="Blank = unlimited." />
            <Field label="Uses per customer" name="perCustomerLimit" type="number" defaultValue={c ? c.perCustomerLimit : 1} hint="Blank = unlimited." />
            <div className="flex flex-col justify-end gap-3 pb-1">
              <Check label="First order only" name="firstOrderOnly" defaultChecked={c?.firstOrderOnly} />
              <Check label="Active" name="isActive" defaultChecked={c?.isActive ?? true} />
            </div>
            <fieldset className="md:col-span-3">
              <legend className="label">Only for these items <span className="font-normal text-ink-soft">(leave all unticked for the whole order)</span></legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {prods.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" name="productIds" value={p.id} defaultChecked={c?.productIds.includes(p.id)} className="accent-[#1f6b3a]" />{p.name}</label>)}
              </div>
            </fieldset>
            <fieldset className="md:col-span-3">
              <legend className="label">…or these categories</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {cats.map((x) => <label key={x.id} className="flex items-center gap-2"><input type="checkbox" name="categoryIds" value={x.id} defaultChecked={c?.categoryIds.includes(x.id)} className="accent-[#1f6b3a]" />{x.name}</label>)}
              </div>
            </fieldset>
            <fieldset className="md:col-span-3">
              <legend className="label">Only in these delivery areas <span className="font-normal text-ink-soft">(leave unticked for all areas)</span></legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {areas.map((x) => <label key={x.id} className="flex items-center gap-2"><input type="checkbox" name="areaIds" value={x.id} defaultChecked={c?.areaIds.includes(x.id)} className="accent-[#1f6b3a]" />{x.name}</label>)}
              </div>
            </fieldset>
            <div className="flex gap-2 md:col-span-3">
              <SubmitButton>Save coupon</SubmitButton>
              <Link href="/admin/coupons" className="btn btn-ghost">Cancel</Link>
            </div>
          </form>
        </Card>
      )}

      {rows.length === 0 ? (
        <Empty>No coupons yet.</Empty>
      ) : (
        <Table head={["Code", "Offer", "Valid", "Used", "Status", ""]}>
          {rows.map((r) => {
            const expired = r.expiresAt && r.expiresAt < now;
            const usedN = used.find((u) => u.couponId === r.id)?.n ?? 0;
            return (
              <tr key={r.id}>
                <td className="px-4 py-3 font-bold">{r.code}</td>
                <td className="px-4 py-3">{describe(r)}</td>
                <td className="px-4 py-3 text-ink-soft">{r.startsAt || r.expiresAt ? `${istDate(r.startsAt) || "now"} → ${istDate(r.expiresAt) || "no end"}` : "Always"}</td>
                <td className="px-4 py-3">{usedN}{r.totalLimit != null ? ` / ${r.totalLimit}` : ""}</td>
                <td className="px-4 py-3"><Badge value={expired ? "INACTIVE" : r.isActive ? "ACTIVE" : "INACTIVE"} />{expired && <span className="ml-1 text-xs text-ink-soft">expired</span>}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Link href={`/admin/coupons?edit=${r.id}`} className="rounded-lg px-2.5 py-1.5 font-semibold text-basil hover:bg-basil-soft">Edit</Link>
                    <form action={toggleCoupon}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="value" value={String(!r.isActive)} /><button className="rounded-lg px-2.5 py-1.5 font-semibold hover:bg-crate">{r.isActive ? "Pause" : "Activate"}</button></form>
                    <form action={deleteCoupon}><input type="hidden" name="id" value={r.id} /><SubmitButton className="rounded-lg px-2.5 py-1.5 font-semibold text-tomato hover:bg-tomato/10" confirm={`Delete ${r.code}?`} pendingText="…">Delete</SubmitButton></form>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
