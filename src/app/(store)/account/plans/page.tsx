import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, subscriptions } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { subscriptionState } from "@/lib/plans";
import { formatDateLong } from "@/lib/time";

export const metadata: Metadata = { title: "My plans", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyPlansPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/plans");
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).orderBy(desc(subscriptions.createdAt));
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10">
      <Link href="/account" className="text-sm font-semibold text-basil">← My account</Link>
      <h1 className="mt-2 text-5xl font-[800] text-basil-deep">My plans</h1>
      {subs.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-crate p-6">
          <p>You don&apos;t have a plan yet.</p>
          <Link href="/plans" className="btn btn-primary mt-4">See meal plans</Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {subs.map((s) => {
            const st = subscriptionState(s);
            return (
              <li key={s.id}>
                <Link href={`/account/plans/${s.number}`} className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-white p-5 hover:border-basil">
                  <div>
                    <p className="font-bold">{s.planName} plan · {s.daysTotal} days</p>
                    <p className="text-sm text-ink-soft">{s.number} · {formatDateLong(s.startDate)} – {formatDateLong(s.endDate)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${st.key === "ACTIVE" ? "bg-basil-soft text-basil-deep" : st.key === "PENDING_PAYMENT" ? "bg-mango/30" : "bg-crate"}`}>{st.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
