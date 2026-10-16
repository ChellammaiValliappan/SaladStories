import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { addresses, coupons, db, orders } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { STATUS_LABELS } from "@/lib/notify";
import { ProfileForm, AddressManager } from "@/components/AccountForms";
import { signOut } from "./actions";
import { PasswordForm } from "@/components/PasswordForm";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const [myOrders, myAddresses, offers] = await Promise.all([
    db.select().from(orders).where(or(eq(orders.userId, user.id), user.email ? eq(orders.email, user.email) : undefined)).orderBy(desc(orders.createdAt)).limit(30),
    db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault)),
    db.select().from(coupons).where(and(eq(coupons.isActive, true), or(isNull(coupons.expiresAt), gt(coupons.expiresAt, new Date())))),
  ]);
  const hasPaid = myOrders.some((o) => o.paymentStatus === "PAID");
  const eligible = offers.filter((c) => !(c.firstOrderOnly && hasPaid) && c.productIds.length === 0 && c.areaIds.length === 0);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-5xl font-[800] text-basil-deep">Hi, {user.name.split(" ")[0]}</h1>
        <form action={signOut}><button className="btn btn-ghost min-h-11 text-sm">Sign out</button></form>
      </div>

      <section id="orders" className="mt-10" aria-labelledby="orders-title">
        <h2 id="orders-title" className="text-3xl font-bold">My orders</h2>
        {myOrders.length === 0 ? (
          <div className="mt-4 rounded-3xl bg-crate p-6">
            <p>You haven't ordered yet.</p>
            <Link href="/menu" className="btn btn-primary mt-4">Order your first bowl</Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-3xl border border-line bg-white">
            {myOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/order/${o.orderNumber}?t=${o.trackingToken}`} className="flex items-center justify-between gap-3 p-4 hover:bg-paper sm:p-5">
                  <div>
                    <p className="font-bold">{o.orderNumber}</p>
                    <p className="text-sm text-ink-soft">{o.slotLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatINR(o.total)}</p>
                    <p className={`text-sm font-semibold ${o.paymentStatus === "PAID" ? "text-basil" : "text-carrot"}`}>
                      {o.paymentStatus === "PAID" ? STATUS_LABELS[o.status] : o.paymentStatus === "FAILED" ? "Payment failed" : "Payment pending"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {eligible.length > 0 && (
        <section className="mt-10" aria-labelledby="offers-title">
          <h2 id="offers-title" className="text-3xl font-bold">Offers you can use</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {eligible.map((c) => (
              <li key={c.id} className="rounded-2xl border-[1.5px] border-dashed border-carrot bg-white p-4">
                <p className="font-display text-xl font-bold tracking-wide">{c.code}</p>
                <p className="text-sm text-ink-soft">{c.description}</p>
                {c.minOrder ? <p className="mt-1 text-xs text-ink-soft">Minimum order {formatINR(c.minOrder)}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">Profile</h2>
          <ProfileForm user={{ name: user.name, email: user.email ?? "", phone: user.phone ?? "" }} />
          <h2 className="mt-8 text-2xl font-bold">Password</h2>
          <div className="panel mt-4 p-5"><PasswordForm /></div>
        </div>
        <div>
          <h2 className="text-3xl font-bold">Saved addresses</h2>
          <AddressManager addresses={myAddresses} defaults={{ fullName: user.name, phone: user.phone ?? "" }} />
        </div>
      </section>
    </div>
  );
}
