import { asc, inArray } from "drizzle-orm";
import { db, users } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { addTeamMember, resetTeamPassword, setTeamRole } from "../../actions";
import { Card, Field, PageHead, Select } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const team = await db.select().from(users).where(inArray(users.role, ["ADMIN", "STAFF"])).orderBy(asc(users.role), asc(users.name));

  return (
    <>
      <PageHead title="Team" />
      <Flash msg={sp.msg} err={sp.err} />
      <div className="mb-6 grid gap-4 rounded-2xl border border-line bg-white p-5 text-sm md:grid-cols-2">
        <div><p className="font-bold">Admin</p><p className="text-ink-soft">Everything: menu editing, prices, nutrition, coupons, delivery, payments, refunds, reports, settings and team.</p></div>
        <div><p className="font-bold">Staff</p><p className="text-ink-soft">Kitchen and delivery: see the dashboard and orders, move orders along, mark items sold out. No refunds, prices or settings.</p></div>
      </div>

      <Card title="Add a team member" className="mb-6">
        <form action={addTeamMember} className="grid items-end gap-4 md:grid-cols-[1fr_1fr_10rem_1fr_auto]">
          <Field label="Name" name="name" required />
          <Field label="Email" name="email" type="email" required />
          <Select label="Access" name="role" defaultValue="STAFF" options={[{ value: "STAFF", label: "Staff" }, { value: "ADMIN", label: "Admin" }]} />
          <Field label="Temporary password" name="password" type="text" required />
          <SubmitButton className="btn btn-primary">Add</SubmitButton>
        </form>
        <p className="mt-3 text-xs text-ink-soft">Share the password privately. They sign in at /admin and can change it under Settings (admins) or My account (staff). If the email already has a customer account, it's upgraded.</p>
      </Card>

      <ul className="space-y-3">
        {team.map((u) => (
          <li key={u.id} className="grid gap-3 rounded-2xl border border-line bg-white p-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div>
              <p className="font-bold">{u.name} {u.id === me.id && <span className="text-sm font-normal text-ink-soft">(you)</span>}</p>
              <p className="text-sm text-ink-soft">{u.email}</p>
              <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${u.role === "ADMIN" ? "bg-basil-soft text-basil-deep" : "bg-mango/25 text-[#7a5300]"}`}>{u.role === "ADMIN" ? "Admin" : "Staff"}</span>
            </div>
            {u.id !== me.id && (
              <>
                <form action={setTeamRole} className="flex gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <select name="role" defaultValue={u.role} className="field min-h-10 py-1.5 text-sm" aria-label={`Access for ${u.name}`}>
                    <option value="ADMIN">Admin</option>
                    <option value="STAFF">Staff</option>
                    <option value="CUSTOMER">Remove access</option>
                  </select>
                  <SubmitButton className="btn btn-ghost min-h-10 px-4 text-sm">Update</SubmitButton>
                </form>
                <form action={resetTeamPassword} className="flex gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <input name="password" placeholder="New password" minLength={8} required className="field min-h-10 py-1.5 text-sm" aria-label={`New password for ${u.name}`} />
                  <SubmitButton className="btn btn-ghost min-h-10 px-4 text-sm">Reset</SubmitButton>
                </form>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
