/**
 * Role checks over HTTP against a running site. Doesn't open the database itself.
 *   npm run test:roles -- (needs a running site)
 * Env: ROLES_URL (e.g. http://localhost:3100), ROLES_ADMIN_EMAIL/PASSWORD, ROLES_STAFF_EMAIL/PASSWORD.
 * Create a staff login first in Admin → Team (or with scripts/make-staff.ts locally).
 */
let fails = 0;
const check = (l: string, c: boolean, x: unknown = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`, c ? "" : JSON.stringify(x)); if (!c) fails++; };
const base = (process.env.ROLES_URL || "http://localhost:3100").replace(/\/$/, "");
const redirected = (s: number) => [302, 303, 307, 308].includes(s);

async function login(email: string, password: string) {
  const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }), redirect: "manual" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const get = (path: string, cookie = "") => fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });

(async () => {
  for (const p of ["/admin", "/admin/finance", "/admin/invoices", "/admin/customers"]) check(`logged out: ${p} → login`, redirected((await get(p)).status));
  check("logged out: exports refused", (await get("/api/admin/export?type=customers")).status === 403);
  check("logged out: invoice PDFs refused", (await get("/api/admin/invoices/x/pdf")).status === 401);
  check("logged out: receipts and bills refused", (await get("/api/admin/receipts/x/pdf")).status === 401 && (await get("/api/admin/files/bills/2026-10/x.jpg")).status === 401);
  check("wrong invoice link → not found", (await get("/invoice/aaaaaaaaaaaaaaaaaaaaaaaa")).status === 404);
  check("scheduler endpoint refuses without its secret", [401, 403].includes((await fetch(`${base}/api/cron/tick`, { method: "POST" })).status));

  const se = process.env.ROLES_STAFF_EMAIL, sp = process.env.ROLES_STAFF_PASSWORD;
  if (se && sp) {
    const staff = await login(se, sp);
    check("staff can log in", staff.length > 10);
    for (const p of ["/admin/finance", "/admin/invoices", "/admin/payments", "/admin/settings", "/admin/team"]) {
      const r = await get(p, staff);
      check(`staff blocked from ${p}`, redirected(r.status) && /\/admin\?err=/.test(r.headers.get("location") ?? ""), r.status);
    }
    for (const p of ["/admin", "/admin/schedule", "/admin/requests", "/admin/kitchen", "/admin/expenses"]) check(`staff can open ${p}`, (await get(p, staff)).status === 200);
    check("staff can't export", (await get("/api/admin/export?type=customers", staff)).status === 403);
  } else console.log("(no staff login given — skipping staff checks)");

  const ae = process.env.ROLES_ADMIN_EMAIL, ap = process.env.ROLES_ADMIN_PASSWORD;
  if (ae && ap) {
    const adm = await login(ae, ap);
    for (const p of ["/admin/finance", "/admin/invoices", "/admin/expenses", "/admin/settings"]) check(`admin can open ${p}`, (await get(p, adm)).status === 200);
    const x = await get("/api/admin/export?type=finance&format=xlsx", adm);
    check("admin can export Excel", x.status === 200 && /spreadsheetml/.test(x.headers.get("content-type") ?? ""));
  } else console.log("(no admin login given — skipping admin checks)");

  console.log(fails ? `\n${fails} FAILED` : "\nALL ROLE CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
