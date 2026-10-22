import "server-only";
import { and, desc, inArray, or, eq } from "drizzle-orm";
import { auditLogs, db } from "@/db";

/** Audit trail for a set of records (e.g. a customer, their plans, days and payments), newest first. */
export async function historyFor(refs: { entity: string; ids: string[] }[], limit = 100) {
  const conds = refs.filter((r) => r.ids.length).map((r) => and(eq(auditLogs.entity, r.entity), inArray(auditLogs.entityId, r.ids)));
  if (!conds.length) return [];
  return db.select().from(auditLogs).where(or(...conds)).orderBy(desc(auditLogs.createdAt)).limit(limit);
}
