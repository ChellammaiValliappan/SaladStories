import { requireAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { categories, db, optionChoices, optionGroups, products } from "@/db";
import { PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { ProductForm } from "@/components/admin/ProductForm";
import { deleteProduct } from "../../../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata = { title: "Edit menu item" };

export default async function ProductEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const product =
    id === "new"
      ? null
      : await db.query.products.findFirst({
          where: eq(products.id, id),
          with: { optionGroups: { orderBy: asc(optionGroups.sortOrder), with: { choices: { orderBy: asc(optionChoices.sortOrder) } } } },
        });
  if (id !== "new" && !product) notFound();

  return (
    <>
      <PageHead title={product ? product.name : "New menu item"} back={{ href: "/admin/products", label: "Menu" }}>
        {product && (
          <form action={deleteProduct}>
            <input type="hidden" name="id" value={product.id} />
            <SubmitButton className="btn btn-ghost min-h-11 text-tomato" confirm="Delete this item permanently? Past orders keep their details. To hide it instead, set its status to Draft or Unavailable." pendingText="Deleting…">Delete</SubmitButton>
          </form>
        )}
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />
      <ProductForm product={product ?? null} categories={cats.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
