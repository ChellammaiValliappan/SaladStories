import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, type SQL } from "drizzle-orm";
import { db, expenseCategories, expenses } from "@/db";
import { audit, type Actor } from "./audit";
import { code, nextNumber } from "./counters";
import { BizError } from "./customers";

export const EXPENSE_METHODS = ["UPI", "CASH", "BANK", "CARD", "OTHER"] as const;
export const EXPENSE_METHOD_LABELS: Record<string, string> = { UPI: "UPI", CASH: "Cash", BANK: "Bank transfer", CARD: "Card", OTHER: "Other" };

export const expenseInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date"),
  categoryId: z.string().min(1, "Pick a category"),
  description: z.string().trim().min(2, "Say what it was for").max(200),
  vendor: z.string().trim().max(120).default(""),
  amount: z.number().int().positive("Enter the amount").max(10_00_00_000, "That amount looks too large"),
  method: z.enum(EXPENSE_METHODS),
  reference: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(500).default(""),
});
export type ExpenseInput = z.input<typeof expenseInput>;
type Attachment = { key: string; name: string; type: string } | null;

export async function createExpense(input: ExpenseInput, attachment: Attachment, actor: Actor) {
  const d = expenseInput.parse(input);
  return db.transaction(async (tx) => {
    const n = await nextNumber(tx, "expense");
    const [row] = await tx
      .insert(expenses)
      .values({ ...d, code: code("EXP", n), attachmentKey: attachment?.key ?? null, attachmentName: attachment?.name ?? null, attachmentType: attachment?.type ?? null, createdBy: actor.name })
      .returning();
    await audit(tx, "expense", row.id, "added", { after: row, actor });
    return row;
  });
}

export async function updateExpense(id: string, input: ExpenseInput, attachment: Attachment, actor: Actor) {
  const d = expenseInput.parse(input);
  const [before] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!before) throw new BizError("Expense not found.");
  if (before.deletedAt) throw new BizError("This expense was removed. Restore it first.");
  return db.transaction(async (tx) => {
    const [after] = await tx
      .update(expenses)
      .set({ ...d, ...(attachment ? { attachmentKey: attachment.key, attachmentName: attachment.name, attachmentType: attachment.type } : {}), updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    const changed = Object.fromEntries(Object.keys(d).filter((k) => (before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k]).map((k) => [k, (before as Record<string, unknown>)[k]]));
    await audit(tx, "expense", id, "edited", { before: { ...changed, ...(attachment ? { attachment: before.attachmentName } : {}) }, after: Object.fromEntries(Object.keys(changed).map((k) => [k, (after as Record<string, unknown>)[k]])), actor });
    return after;
  });
}

/** Mistakes are hidden from totals, never deleted. */
export async function removeExpense(id: string, reason: string, actor: Actor) {
  if (reason.trim().length < 3) throw new BizError("Say why this expense is being removed.");
  const [e] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!e) throw new BizError("Expense not found.");
  if (e.deletedAt) return e;
  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ deletedAt: new Date(), deletedBy: actor.name, deleteReason: reason }).where(eq(expenses.id, id));
    await audit(tx, "expense", id, "removed", { before: { amount: e.amount }, reason, actor });
  });
}

export async function restoreExpense(id: string, actor: Actor) {
  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ deletedAt: null, deletedBy: null, deleteReason: null }).where(eq(expenses.id, id));
    await audit(tx, "expense", id, "restored", { actor });
  });
}

export type ExpenseFilter = { from: string; to: string; categoryId?: string; vendor?: string; q?: string; removed?: boolean };

export async function listExpenses(f: ExpenseFilter) {
  const conds: SQL[] = [gte(expenses.date, f.from), lte(expenses.date, f.to)];
  conds.push(f.removed ? (undefined as never) : isNull(expenses.deletedAt));
  if (f.categoryId) conds.push(eq(expenses.categoryId, f.categoryId));
  if (f.vendor) conds.push(ilike(expenses.vendor, `%${f.vendor}%`));
  if (f.q) conds.push(or(ilike(expenses.description, `%${f.q}%`), ilike(expenses.vendor, `%${f.q}%`), ilike(expenses.code, `%${f.q}%`))!);
  const rows = await db.query.expenses.findMany({ where: and(...conds.filter(Boolean)), with: { category: true }, orderBy: [desc(expenses.date), desc(expenses.createdAt)] });
  const live = rows.filter((r) => !r.deletedAt);
  const byCategory = new Map<string, { name: string; total: number; count: number }>();
  for (const r of live) {
    const k = r.category?.name ?? "Uncategorised";
    const c = byCategory.get(k) ?? { name: k, total: 0, count: 0 };
    c.total += r.amount;
    c.count++;
    byCategory.set(k, c);
  }
  return { rows, total: live.reduce((t, r) => t + r.amount, 0), byCategory: [...byCategory.values()].sort((a, b) => b.total - a.total) };
}

export async function getExpense(id: string) {
  return (await db.query.expenses.findFirst({ where: eq(expenses.id, id), with: { category: true } })) ?? null;
}

export async function listCategories(all = false) {
  return db.select().from(expenseCategories).where(all ? undefined : eq(expenseCategories.isActive, true)).orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
}

export async function addCategory(name: string, actor: Actor) {
  const n = name.trim().slice(0, 60);
  if (n.length < 2) throw new BizError("Enter a category name.");
  const [existing] = await db.select().from(expenseCategories).where(ilike(expenseCategories.name, n));
  if (existing) {
    if (!existing.isActive) await db.update(expenseCategories).set({ isActive: true }).where(eq(expenseCategories.id, existing.id));
    return existing;
  }
  const [row] = await db.insert(expenseCategories).values({ name: n, sortOrder: 100 }).returning();
  await audit(db, "expense-category", row.id, "added", { after: { name: n }, actor });
  return row;
}

export async function setCategoryActive(id: string, active: boolean, actor: Actor) {
  await db.update(expenseCategories).set({ isActive: active }).where(eq(expenseCategories.id, id));
  await audit(db, "expense-category", id, active ? "shown" : "hidden", { actor });
}
