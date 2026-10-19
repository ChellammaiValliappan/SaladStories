import Link from "next/link";

export function PageHead({ title, children, back }: { title: string; children?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && <Link href={back.href} className="text-sm font-semibold text-basil hover:underline">← {back.label}</Link>}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-[800] sm:text-4xl">{title}</h1>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  PAID: "bg-basil-soft text-basil-deep",
  PREPARING: "bg-mango/25 text-[#7a5300]",
  OUT_FOR_DELIVERY: "bg-carrot/20 text-[#8a4608]",
  DELIVERED: "bg-basil text-white",
  CANCELLED: "bg-ink/10 text-ink-soft",
  PENDING_PAYMENT: "bg-crate text-ink-soft",
  FAILED: "bg-tomato/15 text-tomato",
  VERIFYING: "bg-carrot text-white",
  REFUNDED: "bg-beet/15 text-beet",
  PUBLISHED: "bg-basil-soft text-basil-deep",
  DRAFT: "bg-crate text-ink-soft",
  UNAVAILABLE: "bg-tomato/15 text-tomato",
  ACTIVE: "bg-basil-soft text-basil-deep",
  PLAN_ACTIVE: "bg-sprout/40 text-basil-deep",
  COMPLETED: "bg-crate text-ink-soft",
  INACTIVE: "bg-crate text-ink-soft",
};
const LABELS: Record<string, string> = { PENDING_PAYMENT: "Awaiting payment", OUT_FOR_DELIVERY: "Out for delivery", VERIFYING: "Check payment", PLAN_ACTIVE: "Plan active" };

/** Small tag for plan payments and plan days. */
export function KindTag({ kind }: { kind?: string | null }) {
  if (kind !== "PLAN" && kind !== "PLAN_DAY") return null;
  return <span className="ml-1.5 inline-block rounded-full bg-mango/40 px-2 py-0.5 align-middle text-[11px] font-bold text-[#6b4700]">{kind === "PLAN" ? "Plan payment" : "Plan"}</span>;
}
export const orderAmount = (o: { kind?: string | null; total: number }, fmt: (p: number) => string) => (o.kind === "PLAN_DAY" ? "Plan" : fmt(o.total));

/** One badge value for an order, combining payment and kitchen status. */
export function orderBadge(o: { status: string; paymentStatus: string }) {
  if (o.status === "CANCELLED") return "CANCELLED";
  if (o.paymentStatus === "PAID" || o.paymentStatus === "PLAN") return o.status;
  if (o.paymentStatus === "VERIFYING") return "VERIFYING";
  if (o.paymentStatus === "FAILED") return "FAILED";
  return "PENDING_PAYMENT";
}

export function Badge({ value }: { value: string }) {
  const label = LABELS[value] ?? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TONES[value] ?? "bg-crate"}`}>{label}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-ink-soft">{children}</p>;
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-paper text-xs font-bold text-ink-soft">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Field({ label, name, defaultValue, type = "text", hint, required, step, placeholder, className = "" }: {
  label: string; name: string; defaultValue?: string | number | null; type?: string; hint?: string; required?: boolean; step?: string; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} step={step} placeholder={placeholder} defaultValue={defaultValue ?? ""} required={required} className="field" />
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function Check({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f6b3a]" />
      <span><span className="font-semibold">{label}</span>{hint && <span className="block text-xs text-ink-soft">{hint}</span>}</span>
    </label>
  );
}

export function Select({ label, name, defaultValue, options, className = "" }: { label: string; name: string; defaultValue?: string; options: { value: string; label: string }[]; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className="field">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
