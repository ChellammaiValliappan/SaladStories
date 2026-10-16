/**
 * Seeds the starter menu, delivery areas, slots, test coupons and the first
 * admin account. Safe to run more than once (it upserts by slug/code/email).
 *
 * ⚠️ Prices below are PLACEHOLDERS. Nutrition values are intentionally empty —
 * the owner enters verified figures from the admin dashboard (BRD §4.2).
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, categories, products as productsT, optionGroups, optionChoices, deliveryAreas, deliverySlots, coupons as couponsT, storeSettings, users } from "../src/db";
const rs = (r: number) => r * 100; // rupees → paise

type Choice = { name: string; priceDelta?: number; isDefault?: boolean; maxQty?: number };
type Group = { name: string; type: string; required?: boolean; minSelect?: number; maxSelect?: number | null; choices: Choice[] };

const portion: Group = {
  name: "Portion size",
  type: "SINGLE",
  required: true,
  choices: [
    { name: "Regular", isDefault: true },
    { name: "Large", priceDelta: rs(70) },
  ],
};
const dressing: Group = {
  name: "Dressing",
  type: "SINGLE",
  choices: [
    { name: "No dressing", isDefault: true },
    { name: "Lemon herb dressing" },
    { name: "Mint yogurt dressing" },
  ],
};
const spice: Group = {
  name: "Spice level",
  type: "SINGLE",
  required: true,
  choices: [{ name: "Mild", isDefault: true }, { name: "Medium" }, { name: "Spicy" }],
};
const extraEgg: Group = {
  name: "Extra egg",
  type: "QUANTITY",
  maxSelect: 3,
  choices: [{ name: "Boiled egg", priceDelta: rs(20), maxQty: 3 }],
};
const removeVeg = (items: string[]): Group => ({
  name: "Leave out",
  type: "REMOVAL",
  choices: items.map((name) => ({ name })),
});

const products = [
  {
    slug: "high-protein-non-veg-salad",
    name: "High Protein Non-Veg Salad",
    category: "salads",
    accent: "tomato",
    isVeg: false,
    shortDescription: "Chicken with crisp greens, cucumber, tomato and carrot.",
    description:
      "A protein-focused salad bowl featuring chicken and fresh vegetables — tossed together when you order, with your choice of dressing and seasoning.",
    ingredients: ["Chicken", "Lettuce / leafy greens", "Cucumber", "Tomato", "Onion", "Carrot"],
    price: 249,
    featured: true,
    groups: [
      portion,
      { name: "Chicken portion", type: "SINGLE", required: true, choices: [{ name: "Standard chicken", isDefault: true }, { name: "Extra chicken", priceDelta: rs(60) }] },
      spice,
      dressing,
      extraEgg,
      removeVeg(["Onion", "Tomato", "Cucumber"]),
    ],
  },
  {
    slug: "high-protein-paneer-bowl",
    name: "High Protein Paneer Bowl",
    category: "bowls",
    accent: "carrot",
    isVeg: true,
    shortDescription: "Soft paneer cubes with cucumber, tomato, carrot and greens.",
    description:
      "A vegetarian protein-focused bowl featuring paneer and fresh vegetables. Make it large, add extra paneer, and leave out anything you don't fancy.",
    ingredients: ["Paneer", "Cucumber", "Tomato", "Carrot", "Onion", "Leafy greens"],
    price: 229,
    featured: true,
    groups: [
      portion,
      { name: "Extra paneer", type: "YESNO", choices: [{ name: "Add extra paneer", priceDelta: rs(50) }] },
      spice,
      dressing,
      removeVeg(["Onion", "Tomato", "Cucumber"]),
    ],
  },
  {
    slug: "hair-fall-control-bowl",
    name: "Hair Fall Control Bowl",
    category: "bowls",
    accent: "leaf",
    isVeg: true,
    shortDescription: "Fruits, seeds, nuts and vegetables for a balanced, nutrient-rich meal.",
    description:
      "A nutrient-focused bowl built around ingredients commonly associated with a balanced diet and healthy hair nutrition. This is a food product, not a treatment — it doesn't prevent, treat or reverse hair loss.",
    ingredients: ["Seasonal fruits", "Seeds", "Nuts", "Vegetables"],
    price: 199,
    featured: true,
    groups: [
      portion,
      {
        name: "Crunchy toppings",
        type: "MULTIPLE",
        maxSelect: 2,
        choices: [{ name: "Roasted seeds mix", priceDelta: rs(25) }, { name: "Chopped nuts", priceDelta: rs(35) }],
      },
    ],
  },
  {
    slug: "fruits-bowl",
    name: "Fruits Bowl",
    category: "fruit-bowls",
    accent: "beet",
    isVeg: true,
    shortDescription: "Freshly cut seasonal fruits — apple, banana, papaya, watermelon, orange.",
    description:
      "A refreshing bowl of freshly prepared seasonal fruits. What goes in depends on the season and what's freshest at the market that morning.",
    ingredients: ["Apple", "Banana", "Papaya", "Watermelon", "Orange", "Other seasonal fruits"],
    price: 149,
    featured: true,
    groups: [portion, removeVeg(["Banana", "Papaya", "Watermelon"])],
  },
  {
    slug: "egg-crunch-salad",
    name: "Egg Crunch Salad",
    category: "salads",
    accent: "mango",
    isVeg: false,
    containsEgg: true,
    shortDescription: "Boiled eggs, fresh vegetables and a crunchy topping.",
    description:
      "A satisfying salad featuring eggs, fresh vegetables and optional crunchy toppings. Add more eggs if you're after an extra protein boost.",
    ingredients: ["Boiled eggs", "Cucumber", "Tomato", "Carrot", "Leafy greens"],
    price: 179,
    featured: true,
    groups: [
      portion,
      extraEgg,
      {
        name: "Crunchy toppings",
        type: "MULTIPLE",
        maxSelect: 2,
        choices: [{ name: "Toasted croutons", priceDelta: rs(20) }, { name: "Roasted peanuts", priceDelta: rs(20) }, { name: "Seeds mix", priceDelta: rs(25) }],
      },
      dressing,
    ],
  },
];

async function main() {
  // Safe to run on every deploy: starter data is only added to an empty
  // database, so anything the owner edits or deletes is never brought back.
  const firstRun = (await db.select({ id: storeSettings.id }).from(storeSettings)).length === 0;
  if (firstRun) await seedStarterData();
  else console.log("Store already set up — starter data skipped.");
  await ensureAdmin();
  console.log("Seed complete.");
  process.exit(0);
}

async function seedStarterData() {
  await db
    .insert(storeSettings)
    .values({ id: 1, email: process.env.OWNER_EMAIL || "", flatDeliveryFee: rs(40), freeDeliveryAbove: rs(599), minOrderValue: rs(149) })
    .onConflictDoNothing();

  const cats = [
    { slug: "salads", name: "Salads", sortOrder: 1 },
    { slug: "bowls", name: "Protein bowls", sortOrder: 2 },
    { slug: "fruit-bowls", name: "Fruit bowls", sortOrder: 3 },
  ];
  const catIds: Record<string, string> = {};
  for (const c of cats) {
    await db.insert(categories).values(c).onConflictDoNothing();
    const [row] = await db.select().from(categories).where(eq(categories.slug, c.slug));
    catIds[c.slug] = row.id;
  }

  for (const [i, p] of products.entries()) {
    const [exists] = await db.select({ id: productsT.id }).from(productsT).where(eq(productsT.slug, p.slug));
    if (exists) continue;
    const [prod] = await db
      .insert(productsT)
      .values({
        slug: p.slug,
        name: p.name,
        shortDescription: p.shortDescription,
        description: p.description,
        image: `/images/bowls/${p.slug}.svg`,
        accent: p.accent,
        basePrice: rs(p.price),
        categoryId: catIds[p.category],
        isVeg: p.isVeg,
        containsEgg: Boolean(p.containsEgg),
        ingredients: p.ingredients,
        portionSize: "Regular bowl",
        status: "PUBLISHED",
        featured: p.featured,
        sortOrder: i,
        prepTimeMins: 15,
      })
      .returning();
    for (const [gi, g] of p.groups.entries()) {
      const [group] = await db
        .insert(optionGroups)
        .values({
          productId: prod.id,
          name: g.name,
          type: g.type,
          required: Boolean(g.required),
          minSelect: g.minSelect ?? 0,
          maxSelect: g.maxSelect ?? null,
          sortOrder: gi,
        })
        .returning();
      await db.insert(optionChoices).values(
        g.choices.map((c, ci) => ({
          groupId: group.id,
          name: c.name,
          priceDelta: c.priceDelta ?? 0,
          isDefault: Boolean(c.isDefault),
          maxQty: c.maxQty ?? null,
          sortOrder: ci,
        })),
      );
    }
  }

  if ((await db.select().from(deliveryAreas)).length === 0) {
    await db.insert(deliveryAreas).values([
      { name: "Taramani", pincodes: "600113", sortOrder: 0 },
      { name: "Perungudi", pincodes: "600096", sortOrder: 1 },
      { name: "Thoraipakkam", pincodes: "600097", sortOrder: 2 },
    ]);
  }

  if ((await db.select().from(deliverySlots)).length === 0) {
    await db.insert(deliverySlots).values([
      { name: "Lunch", startTime: "12:30", endTime: "14:30", cutoffMinutes: 90, maxOrders: 25, sortOrder: 0 },
      { name: "Afternoon", startTime: "16:00", endTime: "17:30", cutoffMinutes: 90, maxOrders: 15, sortOrder: 1 },
      { name: "Dinner", startTime: "19:00", endTime: "21:00", cutoffMinutes: 120, maxOrders: 25, sortOrder: 2 },
    ]);
  }

  // Test coupons from BRD §7.5 — edit or delete them before launch.
  await db
    .insert(couponsT)
    .values([
      { code: "WELCOME10", description: "10% off your first order (up to ₹100)", type: "PERCENT", value: 10, maxDiscount: rs(100), firstOrderOnly: true, perCustomerLimit: 1 },
      { code: "HEALTH50", description: "₹50 off orders of ₹500 or more", type: "FLAT", value: rs(50), minOrder: rs(500), perCustomerLimit: 3 },
      { code: "FREEDELIVERY", description: "Free delivery on your order", type: "FREE_DELIVERY", value: 0, perCustomerLimit: 1 },
    ])
    .onConflictDoNothing();
}

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if there's no admin yet. */
async function ensureAdmin() {
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "ADMIN"));
  if (admins.length) return;
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) await db.update(users).set({ role: "ADMIN" }).where(eq(users.id, existing.id));
    else
      await db.insert(users).values({ email, name: "Salad Stories Admin", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) });
    console.log(`Admin account ready: ${email}`);
  } else {
    console.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin account created.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
