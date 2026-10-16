import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { categories, db, optionChoices, optionGroups, products } from "@/db";

const withOptions = {
  optionGroups: {
    orderBy: asc(optionGroups.sortOrder),
    with: { choices: { orderBy: asc(optionChoices.sortOrder) } },
  },
} satisfies Record<string, unknown>;

export async function getProductsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.query.products.findMany({ where: inArray(products.id, ids), with: withOptions });
}

/** Everything the public can see: published and temporarily unavailable items. */
export async function getMenu() {
  const [items, cats] = await Promise.all([
    db.query.products.findMany({
      where: ne(products.status, "DRAFT"),
      orderBy: [asc(products.sortOrder), asc(products.name)],
      with: withOptions,
    }),
    db.select().from(categories).orderBy(asc(categories.sortOrder)),
  ]);
  return { items, categories: cats };
}

export async function getProductBySlug(slug: string) {
  return db.query.products.findFirst({
    where: and(eq(products.slug, slug), ne(products.status, "DRAFT")),
    with: { ...withOptions, category: true },
  });
}

export type MenuProduct = Awaited<ReturnType<typeof getMenu>>["items"][number];

export function isOrderable(p: { status: string; stockStatus: string }) {
  return p.status === "PUBLISHED" && p.stockStatus === "IN_STOCK";
}

export function availabilityLabel(p: { status: string; stockStatus: string }) {
  if (p.status === "UNAVAILABLE") return "Unavailable today";
  if (p.stockStatus === "SOLD_OUT") return "Sold out";
  return "Available";
}

/** Strip server-only fields before sending a product to the browser. */
export function toClientProduct(p: MenuProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    image: p.image,
    accent: p.accent,
    basePrice: p.basePrice,
    discountPrice: p.discountPrice,
    isVeg: p.isVeg,
    containsEgg: p.containsEgg,
    proteinG: p.nutritionVerified ? p.proteinG : null,
    orderable: isOrderable(p),
    availability: availabilityLabel(p),
    maxPerOrder: p.maxPerOrder,
    optionGroups: p.optionGroups.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      isActive: g.isActive,
      choices: g.choices.map((c) => ({
        id: c.id,
        name: c.name,
        priceDelta: c.priceDelta,
        isDefault: c.isDefault,
        isActive: c.isActive,
        maxQty: c.maxQty,
      })),
    })),
  };
}
export type ClientProduct = ReturnType<typeof toClientProduct>;
