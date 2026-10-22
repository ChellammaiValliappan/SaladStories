import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { listCustomers } from "@/lib/biz/customers";
import { CUSTOMER_STATUS_LABELS } from "@/lib/biz/core";
import { formatINR } from "@/lib/money";
import { formatDateLong } from "@/lib/time";
import { Badge, Empty, PageHead, Table } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";

export const metadata = { title: "Customers" };

const FILTERS = [
  { id: "", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "TRIAL", label: "Trial" },
  { id: "DUE", label: "Payment due" },
  { id: "EXPIRED", label: "Expired" },
  { id: "PAUSED", label: "Paused" },
  { id: "NEW", label: "New" },
  { id: "CANCELLED", label: "Cancelled" },
];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; msg?: string; err?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const rows = await listCustomers({ q: sp.q, status: sp.status });
  const qs = (status: string) => `/admin/customers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}) })}`;
  return (
    <>
      <PageHead title="Customers">
        {me.role === "ADMIN" && (
          <Link href="/admin/customers/new" className="btn btn-primary min-h-11 text-sm"><UserPlus className="h-4 w-4" /> Add customer</Link>
        )}
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />
      <form className="mb-3 flex gap-2" role="search">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <label className="sr-only" htmlFor="q">Search customers</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input id="q" name="q" defaultValue={sp.q} placeholder="Name, phone or customer ID" className="field pl-9" />
        </div>
        <button className="btn btn-ghost">Search</button>
      </form>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link key={f.id} href={qs(f.id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${(sp.status ?? "") === f.id ? "bg-basil text-white" : "bg-white ring-1 ring-line"}`}>{f.label}</Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>{sp.q || sp.status ? "No customers match." : "No customers yet. Add your first one, or they'll appear when someone orders on the website."}</Empty>
      ) : (
        <>
          <ul className="space-y-2 sm:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/customers/${c.id}`} className="block rounded-2xl border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{c.name}</p>
                      <p className="text-sm text-ink-soft">{c.code} · {c.phone}</p>
                    </div>
                    <Badge value={c.status} />
                  </div>
                  {c.current && <p className="mt-2 text-sm">{c.current.planName} plan · until {formatDateLong(c.current.endDate)}</p>}
                  {c.balance > 0 && <p className="mt-1 text-sm font-semibold text-tomato">Due {formatINR(c.balance)}</p>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
            <Table head={["Customer", "Phone", "Status", "Current plan", "Due"]}>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-paper">
                  <td className="px-4 py-3"><Link href={`/admin/customers/${c.id}`} className="font-bold text-basil hover:underline">{c.name}</Link><br /><span className="text-ink-soft">{c.code}</span></td>
                  <td className="px-4 py-3">{c.phone}</td>
                  <td className="px-4 py-3"><Badge value={c.status} /></td>
                  <td className="px-4 py-3">{c.current ? <>{c.current.planName}<br /><span className="text-ink-soft">until {formatDateLong(c.current.endDate)}</span></> : <span className="text-ink-soft">—</span>}</td>
                  <td className={`px-4 py-3 font-semibold ${c.balance > 0 ? "text-tomato" : "text-ink-soft"}`}>{c.balance > 0 ? formatINR(c.balance) : "—"}</td>
                </tr>
              ))}
            </Table>
          </div>
          <p className="mt-3 text-xs text-ink-soft">{rows.length} customer{rows.length === 1 ? "" : "s"}. Statuses: {Object.values(CUSTOMER_STATUS_LABELS).join(", ")}.</p>
        </>
      )}
    </>
  );
}
