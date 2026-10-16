import { desc, eq, max, sql, count, sum } from "drizzle-orm";
import { db, orders, users } from "@/db";
import { formatINR } from "@/lib/money";
import { setUserBlocked } from "../../actions";
import { Badge, Empty, PageHead, Table } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  // Everyone who has paid for an order, guest or registered, grouped by email.
  const [buyers, accounts] = await Promise.all([
    db
      .select({
        email: orders.email,
        name: max(orders.customerName),
        phone: max(orders.phone),
        orders: count(),
        spent: sum(orders.total),
        last: max(orders.createdAt),
        hasAccount: sql<boolean>`bool_or(${orders.userId} is not null)`,
      })
      .from(orders)
      .where(eq(orders.paymentStatus, "PAID"))
      .groupBy(orders.email)
      .orderBy(desc(max(orders.createdAt)))
      .limit(300),
    db.select().from(users).where(eq(users.role, "CUSTOMER")).orderBy(desc(users.createdAt)).limit(300),
  ]);

  return (
    <>
      <PageHead title="Customers" />
      <Flash msg={sp.msg} err={sp.err} />
      <h2 className="mb-3 text-xl font-bold">Paying customers</h2>
      {buyers.length === 0 ? (
        <Empty>Customers appear here after their first paid order.</Empty>
      ) : (
        <Table head={["Customer", "Contact", "Orders", "Total spent", "Last order", "Account"]}>
          {buyers.map((b) => (
            <tr key={b.email}>
              <td className="px-4 py-3 font-semibold">{b.name}</td>
              <td className="px-4 py-3">{b.phone}<br /><span className="text-ink-soft">{b.email}</span></td>
              <td className="px-4 py-3">{b.orders}</td>
              <td className="px-4 py-3 font-semibold">{formatINR(Number(b.spent ?? 0))}</td>
              <td className="px-4 py-3 text-ink-soft">{b.last ? new Date(b.last).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : ""}</td>
              <td className="px-4 py-3">{b.hasAccount ? "Registered" : "Guest"}</td>
            </tr>
          ))}
        </Table>
      )}

      <h2 className="mb-3 mt-8 text-xl font-bold">Registered accounts</h2>
      {accounts.length === 0 ? (
        <Empty>No one has created an account yet.</Empty>
      ) : (
        <Table head={["Name", "Email", "Phone", "Joined", "Status", ""]}>
          {accounts.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-semibold">{u.name}</td>
              <td className="px-4 py-3">{u.email}</td>
              <td className="px-4 py-3">{u.phone}</td>
              <td className="px-4 py-3 text-ink-soft">{new Date(u.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
              <td className="px-4 py-3"><Badge value={u.isBlocked ? "CANCELLED" : "ACTIVE"} /></td>
              <td className="px-4 py-3 text-right">
                <form action={setUserBlocked}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="value" value={String(!u.isBlocked)} />
                  <button className="rounded-lg px-2.5 py-1.5 text-sm font-semibold hover:bg-crate">{u.isBlocked ? "Unblock" : "Block"}</button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
