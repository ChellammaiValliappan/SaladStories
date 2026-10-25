/** M4: expenses, bill uploads, finance figures, exports. Run: npm run test:integration */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, expenses, payments, users } from "../../src/db";
import { BizError } from "../../src/lib/biz/customers";
import { addCategory, createExpense, listCategories, listExpenses, removeExpense, restoreExpense, updateExpense } from "../../src/lib/biz/expenses";
import { financeSummary, periodFor } from "../../src/lib/biz/finance";
import { exportSheets, toCsv, toXlsx } from "../../src/lib/biz/exports";
import { readFile, saveFile } from "../../src/lib/files";
import { historyFor } from "../../src/lib/biz/history";
import { istParts } from "../../src/lib/time";

let fails = 0;
const check = (l: string, c: boolean, x: unknown = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`, c ? "" : JSON.stringify(x)); if (!c) fails++; };
const T = Date.now();

(async () => {
  const [admin] = await db.select().from(users).where(eq(users.role, "ADMIN"));
  const actor = { id: admin.id, name: "Owner" };
  const today = istParts().dateStr;
  const cats = await listCategories();
  check("12 starter categories", cats.length >= 12 && cats.some((c) => c.name === "Vegetables") && cats.some((c) => c.name === "Marketing & Meta ads"), cats.length);
  const veg = cats.find((c) => c.name === "Vegetables")!;
  const pack = cats.find((c) => c.name === "Packaging")!;

  const before = await financeSummary(today, today);

  // Bill upload (stored in the database locally; Netlify Blobs on Netlify)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const key = await saveFile(new File([png], "bill.png", { type: "image/png" }), "bills");
  const back = await readFile(key);
  check("bill photo saved and read back", !!back && back.contentType === "image/png" && back.bytes.equals(png), key);
  await saveFile(new File(["x"], "a.exe", { type: "application/x-msdownload" }), "bills").then(() => check("other file types refused", false)).catch(() => check("other file types refused", true));

  const e1 = await createExpense({ date: today, categoryId: veg.id, description: "Lettuce and cucumber " + T, vendor: "Koyambedu", amount: 125050, method: "CASH" }, { key, name: "bill.png", type: "image/png" }, actor);
  check("expense code EXP-NNNN", /^EXP-\d{4}$/.test(e1.code), e1.code);
  const e2 = await createExpense({ date: today, categoryId: pack.id, description: "=HYPERLINK(\"x\") boxes " + T, vendor: "PackCo", amount: 50000, method: "UPI" }, null, actor);
  await createExpense({ date: today, categoryId: veg.id, description: "", amount: 100, method: "UPI" }, null, actor).then(() => check("description required", false)).catch((e) => check("description required", !!e.issues));

  let list = await listExpenses({ from: today, to: today });
  check("list totals include both", list.rows.some((r) => r.id === e1.id) && list.rows.some((r) => r.id === e2.id));
  const vegRow = list.byCategory.find((c) => c.name === "Vegetables")!;
  check("by-category totals", !!vegRow && vegRow.total >= 125050);

  // Edit is audited with before/after
  await updateExpense(e1.id, { date: today, categoryId: veg.id, description: "Lettuce and cucumber " + T, vendor: "Koyambedu", amount: 130000, method: "CASH" }, null, actor);
  const h = await historyFor([{ entity: "expense", ids: [e1.id] }]);
  const edit = h.find((x) => x.action === "edited") as { before: { amount?: number }; after: { amount?: number } } | undefined;
  check("edit keeps old and new amount in history", edit?.before?.amount === 125050 && edit?.after?.amount === 130000, edit);

  // Remove → out of totals, kept; restore → back
  await removeExpense(e2.id, "x", actor).then(() => check("remove needs a reason", false)).catch((e) => check("remove needs a reason", e instanceof BizError));
  await removeExpense(e2.id, "Entered twice", actor);
  list = await listExpenses({ from: today, to: today });
  const [kept] = await db.select().from(expenses).where(eq(expenses.id, e2.id));
  check("removed expense hidden from totals but kept", !list.rows.some((r) => r.id === e2.id) && !!kept.deletedAt && kept.deleteReason === "Entered twice");
  const after = await financeSummary(today, today);
  check("finance expenses = before + 1300", after.expenses.total - before.expenses.total === 130000, [before.expenses.total, after.expenses.total]);
  await restoreExpense(e2.id, actor);
  const restored = await financeSummary(today, today);
  check("restore puts it back", restored.expenses.total - before.expenses.total === 180000);

  // Finance figures agree with the ledger
  const p = periodFor("fy");
  const f = await financeSummary(p.from, p.to);
  const [led] = await db.execute<{ net: number }>(sql`select coalesce(sum(case when type='REFUND' then -amount else amount end),0)::int as net from payments where status='RECEIVED' and paid_at >= ${p.from + "T00:00:00+05:30"}::timestamptz and paid_at <= ${p.to + "T23:59:59.999+05:30"}::timestamptz`).then((r) => ("rows" in r ? (r as { rows: { net: number }[] }).rows : (r as unknown as { net: number }[])));
  check("money received matches the payments ledger", f.collections.net === Number(led.net), [f.collections.net, led.net]);
  check("daily series adds up to the totals", f.daily.reduce((t, d) => t + d.collected, 0) === f.collections.net && f.daily.reduce((t, d) => t + d.spent, 0) === f.expenses.total);
  check("profit = sales before tax − expenses; cash flow = received − expenses", f.profit === f.sales.exTax - f.expenses.total && f.cashFlow === f.collections.net - f.expenses.total);
  check("by-method adds up", f.collections.byMethod.reduce((t, m) => t + m.total, 0) === f.collections.net);
  check("periods", periodFor("month").from.endsWith("-01") && periodFor("last-month").to < periodFor("month").from && periodFor("custom", "2026-10-10", "2026-10-01").from === "2026-10-01");

  // Exports
  const sheets = await exportSheets("expenses", today, today);
  const csv = toCsv(sheets);
  check("CSV has header + rows, formulas neutralised", csv.startsWith("﻿") && csv.includes('"Code"') && csv.includes(`"'=HYPERLINK`) && !csv.includes(`"=HYPERLINK`), csv.slice(0, 200));
  const wb = await toXlsx(await exportSheets("finance", p.from, p.to));
  check("finance workbook is a real .xlsx", wb.subarray(0, 2).toString() === "PK" && wb.length > 5000, wb.length);
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(wb as never);
  const names = book.worksheets.map((w) => w.name);
  check("workbook sheets", ["Summary", "By day", "Expenses by category", "Invoices", "Payments", "Expenses"].every((n) => names.includes(n)), names);
  const netRow = book.getWorksheet("Summary")!.getRows(2, 30)!.find((r) => r.getCell(1).value === "Net collections (₹)");
  check("workbook numbers match the dashboard", Number(netRow?.getCell(2).value) === f.collections.net / 100, netRow?.getCell(2).value);
  for (const t of ["payments", "invoices", "customers", "plans", "orders"] as const) {
    const s = await exportSheets(t, p.from, p.to);
    check(`${t} export`, s[0].rows.every((r) => r.length === s[0].columns.length), s[0].name);
  }

  // Category management
  const c = await addCategory("Gas cylinder " + (T % 1000), actor);
  const again = await addCategory(c.name.toUpperCase(), actor);
  check("category names are unique (case-insensitive)", again.id === c.id);

  const live = await db.select({ n: sql<number>`count(*)::int` }).from(expenses).where(and(isNull(expenses.deletedAt)));
  check("sanity", live[0].n > 0);
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
