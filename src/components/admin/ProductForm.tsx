"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { saveProduct, uploadImage } from "@/app/admin/actions";
import { OPTION_TYPE_LABELS, type OptionType } from "@/lib/customization";
import { SubmitButton } from "./SubmitButton";
import { Check, Field, Select } from "./ui";

type Choice = { id?: string; name: string; priceDelta: number; isDefault: boolean; isActive: boolean; maxQty: number | null };
type Group = { id?: string; name: string; type: OptionType; required: boolean; minSelect: number; maxSelect: number | null; isActive: boolean; choices: Choice[] };

type Product = {
  id: string; name: string; slug: string; shortDescription: string; description: string; image: string | null; gallery: string[]; accent: string;
  basePrice: number; discountPrice: number | null; categoryId: string | null; isVeg: boolean; containsEgg: boolean; ingredients: string[];
  portionSize: string; servingInfo: string; proteinG: number | null; calories: number | null; carbsG: number | null; fatG: number | null;
  fibreG: number | null; nutritionVerified: boolean; allergens: string; prepTimeMins: number | null; status: string; stockStatus: string;
  dailyLimit: number | null; maxPerOrder: number | null; sortOrder: number; featured: boolean; planTier: string;
  optionGroups: { id: string; name: string; type: string; required: boolean; minSelect: number; maxSelect: number | null; isActive: boolean;
    choices: { id: string; name: string; priceDelta: number; isDefault: boolean; isActive: boolean; maxQty: number | null }[] }[];
};

const ACCENTS = [
  { value: "leaf", label: "Leaf green", color: "#4c9a2a" },
  { value: "tomato", label: "Tomato red", color: "#e4472b" },
  { value: "carrot", label: "Carrot orange", color: "#f08a24" },
  { value: "beet", label: "Beetroot pink", color: "#c22e6b" },
  { value: "mango", label: "Mango yellow", color: "#f5b82e" },
];

const rupees = (p: number | null | undefined) => (p == null ? "" : String(p / 100));

export function ProductForm({ product, categories }: { product: Product | null; categories: { id: string; name: string }[] }) {
  const p = product;
  const [image, setImage] = useState(p?.image ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [accent, setAccent] = useState(p?.accent ?? "leaf");
  const [groups, setGroups] = useState<Group[]>(
    (p?.optionGroups ?? []).map((g) => ({ ...g, type: g.type as OptionType, choices: g.choices.map((c) => ({ ...c })) })),
  );

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadErr("");
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadImage(fd);
    setUploading(false);
    if (r.url) setImage(r.url);
    else setUploadErr(r.error ?? "Upload failed.");
  }

  const updateGroup = (i: number, patch: Partial<Group>) => setGroups((gs) => gs.map((g, gi) => (gi === i ? { ...g, ...patch } : g)));
  const updateChoice = (gi: number, ci: number, patch: Partial<Choice>) =>
    setGroups((gs) =>
      gs.map((g, i) =>
        i !== gi
          ? g
          : {
              ...g,
              choices: g.choices.map((c, j) => {
                if (j === ci) return { ...c, ...patch };
                // Single-choice groups can only have one default.
                if (patch.isDefault && g.type === "SINGLE") return { ...c, isDefault: false };
                return c;
              }),
            },
      ),
    );
  const move = (i: number, dir: -1 | 1) =>
    setGroups((gs) => {
      const j = i + dir;
      if (j < 0 || j >= gs.length) return gs;
      const next = [...gs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const foodType = p ? (p.isVeg ? "veg" : p.containsEgg ? "egg" : "nonveg") : "veg";

  return (
    <form action={saveProduct} className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      {p && <input type="hidden" name="id" value={p.id} />}
      <input type="hidden" name="optionGroups" value={JSON.stringify(groups)} />
      <input type="hidden" name="image" value={image} />
      <input type="hidden" name="accent" value={accent} />

      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-4 text-lg font-bold">Basics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" defaultValue={p?.name} required className="sm:col-span-2" />
            <Field label="Short description" name="shortDescription" defaultValue={p?.shortDescription} hint="One line shown on menu cards." className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <label className="label" htmlFor="description">Full description</label>
              <textarea id="description" name="description" rows={4} defaultValue={p?.description} className="field" />
            </div>
            <Select label="Category" name="categoryId" defaultValue={p?.categoryId ?? ""} options={[{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
            <Select label="Food type" name="foodType" defaultValue={foodType} options={[{ value: "veg", label: "Vegetarian" }, { value: "egg", label: "Contains egg (non-veg)" }, { value: "nonveg", label: "Non-vegetarian" }]} />
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ingredients">Ingredients</label>
              <textarea id="ingredients" name="ingredients" rows={3} defaultValue={p?.ingredients.join("\n")} className="field" placeholder="One per line" />
            </div>
            <Field label="Allergens" name="allergens" defaultValue={p?.allergens} placeholder="e.g. Contains dairy, nuts" className="sm:col-span-2" />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-4 text-lg font-bold">Price and portion</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Base price (₹)" name="basePrice" type="number" step="0.01" defaultValue={rupees(p?.basePrice)} required />
            <Field label="Discounted price (₹)" name="discountPrice" type="number" step="0.01" defaultValue={rupees(p?.discountPrice)} hint="Leave blank for no discount." />
            <Field label="Preparation time (min)" name="prepTimeMins" type="number" defaultValue={p?.prepTimeMins} />
            <Field label="Portion size" name="portionSize" defaultValue={p?.portionSize} placeholder="e.g. 350 g bowl" />
            <Field label="Serving info" name="servingInfo" defaultValue={p?.servingInfo} placeholder="e.g. Serves 1" className="sm:col-span-2" />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg font-bold">Nutrition per serving</h2>
          <p className="mb-4 text-sm text-ink-soft">Only enter figures from a verified recipe calculation or lab analysis. They stay hidden from customers until you tick “verified”.</p>
          <div className="grid gap-4 sm:grid-cols-5">
            <Field label="Protein (g)" name="proteinG" type="number" step="0.1" defaultValue={p?.proteinG} />
            <Field label="Calories" name="calories" type="number" defaultValue={p?.calories} />
            <Field label="Carbs (g)" name="carbsG" type="number" step="0.1" defaultValue={p?.carbsG} />
            <Field label="Fat (g)" name="fatG" type="number" step="0.1" defaultValue={p?.fatG} />
            <Field label="Fibre (g)" name="fibreG" type="number" step="0.1" defaultValue={p?.fibreG} />
          </div>
          <div className="mt-4">
            <Check label="These nutrition figures are verified" name="nutritionVerified" defaultChecked={p?.nutritionVerified} hint="Shows them on the menu and product page." />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Customization options</h2>
            <button
              type="button"
              className="btn btn-ghost min-h-10 text-sm"
              onClick={() => setGroups((gs) => [...gs, { name: "", type: "SINGLE", required: false, minSelect: 0, maxSelect: null, isActive: true, choices: [{ name: "", priceDelta: 0, isDefault: false, isActive: true, maxQty: null }] }])}
            >
              <Plus className="h-4 w-4" /> Add option group
            </button>
          </div>
          <p className="mb-4 text-sm text-ink-soft">Only add options your kitchen can actually make. Extra prices are added to the bowl price.</p>
          {groups.length === 0 && <p className="rounded-xl bg-crate p-4 text-sm">No options — the bowl is sold as it is.</p>}
          <div className="space-y-4">
            {groups.map((g, gi) => (
              <div key={g.id ?? `new-${gi}`} className={`rounded-2xl border-[1.5px] p-4 ${g.isActive ? "border-line" : "border-dashed border-line opacity-70"}`}>
                <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
                  <div>
                    <label className="label">Group name</label>
                    <input className="field" value={g.name} placeholder="e.g. Portion size" onChange={(e) => updateGroup(gi, { name: e.target.value })} required />
                  </div>
                  <div>
                    <label className="label">Type</label>
                    <select className="field" value={g.type} onChange={(e) => updateGroup(gi, { type: e.target.value as OptionType })}>
                      {Object.entries(OPTION_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end gap-1">
                    <button type="button" className="grid h-12 w-10 place-items-center rounded-lg hover:bg-crate" onClick={() => move(gi, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" className="grid h-12 w-10 place-items-center rounded-lg hover:bg-crate" onClick={() => move(gi, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" className="grid h-12 w-10 place-items-center rounded-lg text-tomato hover:bg-tomato/10" onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))} aria-label="Remove group"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#1f6b3a]" checked={g.required} onChange={(e) => updateGroup(gi, { required: e.target.checked })} /> Customer must choose</label>
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#1f6b3a]" checked={g.isActive} onChange={(e) => updateGroup(gi, { isActive: e.target.checked })} /> Available</label>
                  {g.type !== "SINGLE" && g.type !== "YESNO" && (
                    <>
                      <label className="flex items-center gap-2">Min <input type="number" min={0} className="field min-h-9 w-20 py-1" value={g.minSelect} onChange={(e) => updateGroup(gi, { minSelect: Math.max(0, Number(e.target.value)) })} /></label>
                      <label className="flex items-center gap-2">Max <input type="number" min={1} className="field min-h-9 w-20 py-1" value={g.maxSelect ?? ""} placeholder="Any" onChange={(e) => updateGroup(gi, { maxSelect: e.target.value ? Math.max(1, Number(e.target.value)) : null })} /></label>
                    </>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  {g.choices.map((c, ci) => (
                    <div key={c.id ?? `c-${ci}`} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2 sm:grid-cols-[1fr_8rem_auto_auto_auto]">
                      <input className="field min-h-10 py-2" value={c.name} placeholder={g.type === "REMOVAL" ? "Ingredient, e.g. Onion" : "Choice, e.g. Large"} onChange={(e) => updateChoice(gi, ci, { name: e.target.value })} required aria-label="Choice name" />
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">+₹</span>
                        <input type="number" step="0.01" className="field min-h-10 py-2 pl-9" value={c.priceDelta / 100} onChange={(e) => updateChoice(gi, ci, { priceDelta: Math.round(Number(e.target.value) * 100) })} aria-label="Extra price" />
                      </div>
                      <label className="hidden items-center gap-1.5 text-xs sm:flex"><input type="checkbox" className="accent-[#1f6b3a]" checked={c.isDefault} onChange={(e) => updateChoice(gi, ci, { isDefault: e.target.checked })} /> Default</label>
                      <label className="hidden items-center gap-1.5 text-xs sm:flex"><input type="checkbox" className="accent-[#1f6b3a]" checked={c.isActive} onChange={(e) => updateChoice(gi, ci, { isActive: e.target.checked })} /> In stock</label>
                      <button type="button" className="grid h-10 w-9 place-items-center rounded-lg text-ink-soft hover:bg-crate" aria-label="Remove choice" onClick={() => updateGroup(gi, { choices: g.choices.filter((_, j) => j !== ci) })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {g.type === "QUANTITY" && (
                        <label className="col-span-full flex items-center gap-2 text-xs text-ink-soft">Max per bowl <input type="number" min={1} className="field min-h-8 w-20 py-1" value={c.maxQty ?? ""} onChange={(e) => updateChoice(gi, ci, { maxQty: e.target.value ? Number(e.target.value) : null })} /></label>
                      )}
                    </div>
                  ))}
                  {g.type !== "YESNO" || g.choices.length === 0 ? (
                    <button type="button" className="text-sm font-semibold text-basil hover:underline" onClick={() => updateGroup(gi, { choices: [...g.choices, { name: "", priceDelta: 0, isDefault: false, isActive: true, maxQty: null }] })}>
                      + Add choice
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-3 text-lg font-bold">Publish</h2>
          <div className="space-y-4">
            <Select label="Status" name="status" defaultValue={p?.status ?? "DRAFT"} options={[{ value: "DRAFT", label: "Draft (hidden)" }, { value: "PUBLISHED", label: "Published" }, { value: "UNAVAILABLE", label: "Unavailable (shown, can't order)" }]} />
            <Select label="Stock" name="stockStatus" defaultValue={p?.stockStatus ?? "IN_STOCK"} options={[{ value: "IN_STOCK", label: "In stock" }, { value: "SOLD_OUT", label: "Sold out" }]} />
            <Select label="Meal-plan tier" name="planTier" defaultValue={p?.planTier ?? "STANDARD"} options={[{ value: "STANDARD", label: "Standard (included in plan price)" }, { value: "PREMIUM", label: "Premium (adds the plan's premium charge)" }]} />
            <Field label="Daily limit" name="dailyLimit" type="number" defaultValue={p?.dailyLimit} hint="Max bowls per delivery day. Blank = no limit." />
            <Field label="Max per order" name="maxPerOrder" type="number" defaultValue={p?.maxPerOrder} hint="Blank = no limit." />
            <Field label="Display order" name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} hint="Lower numbers appear first." />
            <Check label="Feature on the home page" name="featured" defaultChecked={p?.featured ?? true} />
            <Field label="Web address (slug)" name="slug" defaultValue={p?.slug} hint="Leave blank to create from the name." />
          </div>
          <SubmitButton className="btn btn-primary mt-5 w-full">Save item</SubmitButton>
        </section>

        <section className={`accent-${accent} rounded-2xl border border-line bg-white p-5`}>
          <h2 className="mb-3 text-lg font-bold">Photo</h2>
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-[var(--accent-soft)]">
            {image ? <Image src={image} alt="" fill unoptimized className="object-cover" sizes="320px" /> : <p className="grid h-full place-items-center text-sm text-ink-soft">No photo yet</p>}
          </div>
          <label className="btn btn-ghost mt-3 w-full cursor-pointer">
            {uploading ? "Uploading…" : "Upload a photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
          {uploadErr && <p className="mt-2 text-sm text-tomato">{uploadErr}</p>}
          <label className="label mt-3" htmlFor="imageUrl">…or paste an image URL</label>
          <input id="imageUrl" className="field" value={image} onChange={(e) => setImage(e.target.value)} />
          <label className="label mt-3" htmlFor="gallery">Extra photos (one URL per line)</label>
          <textarea id="gallery" name="gallery" rows={2} className="field" defaultValue={p?.gallery.join("\n")} />
          <p className="label mt-4">Card colour</p>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button key={a.value} type="button" onClick={() => setAccent(a.value)} aria-pressed={accent === a.value} title={a.label}
                className={`h-9 w-9 rounded-full ring-offset-2 ${accent === a.value ? "ring-2 ring-ink" : ""}`} style={{ background: a.color }}>
                <span className="sr-only">{a.label}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </form>
  );
}
