import "server-only";
import { auditLogs, type DB } from "@/db";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

export type Actor = { id: string | null; name: string };
export const SYSTEM: Actor = { id: null, name: "System" };
export const CUSTOMER = (id: string | null, name: string): Actor => ({ id, name: `${name} (customer)` });

/** Records who changed what and why. Pass the open transaction so the log commits with the change. */
export async function audit(
  tx: Tx,
  entity: string,
  entityId: string,
  action: string,
  opts: { before?: unknown; after?: unknown; reason?: string; actor?: Actor } = {},
) {
  const actor = opts.actor ?? SYSTEM;
  await tx.insert(auditLogs).values({
    entity,
    entityId,
    action,
    before: (opts.before ?? null) as never,
    after: (opts.after ?? null) as never,
    reason: opts.reason ?? "",
    actorId: actor.id,
    actorName: actor.name,
  });
}
