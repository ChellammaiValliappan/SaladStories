import "server-only";
import { sql } from "drizzle-orm";
import { counters, type DB } from "@/db";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

/** Next number in a gap-free sequence. Call inside the transaction that uses it. */
export async function nextNumber(tx: Tx, key: string) {
  const [row] = await tx
    .insert(counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning();
  return row.value;
}

export const code = (prefix: string, n: number, pad = 4) => `${prefix}-${String(n).padStart(pad, "0")}`;
