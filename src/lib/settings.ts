import { cache } from "react";
import { db, storeSettings } from "@/db";
import { eq } from "drizzle-orm";

export const getSettings = cache(async () => {
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  if (row) return row;
  const [created] = await db.insert(storeSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(storeSettings).where(eq(storeSettings.id, 1)))[0];
});

export type Settings = Awaited<ReturnType<typeof getSettings>>;

export function whatsappLink(number: string, text?: string) {
  const digits = number.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
