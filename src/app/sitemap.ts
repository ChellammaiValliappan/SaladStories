import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db, products } from "@/db";

export const dynamic = "force-dynamic";
const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/menu", "/plans", "/about", "/contact", "/faq", "/policies/delivery", "/policies/refund", "/policies/privacy", "/policies/terms"];
  let items: { slug: string; updatedAt: Date }[] = [];
  try {
    items = await db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(eq(products.status, "PUBLISHED"));
  } catch {
    // Sitemap still works if the database is briefly unreachable.
  }
  return [
    ...pages.map((p) => ({ url: `${site}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : p === "/menu" ? 0.9 : 0.4 })),
    ...items.map((p) => ({ url: `${site}/menu/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
