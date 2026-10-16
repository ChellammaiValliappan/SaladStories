import { desc } from "drizzle-orm";
import { db, reviews } from "@/db";
import { deleteReview, saveReview, toggleReview } from "../../actions";
import { Badge, Card, Check, Field, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select().from(reviews).orderBy(desc(reviews.createdAt));
  return (
    <>
      <PageHead title="Customer reviews" />
      <Flash msg={sp.msg} err={sp.err} />
      <p className="mb-5 max-w-2xl text-sm text-ink-soft">
        Add genuine reviews you've received (for example on WhatsApp or Google) with the customer's permission. Published reviews appear on the home page; if none are published, the section is hidden.
      </p>
      <Card title="Add a review" className="mb-6">
        <form action={saveReview} className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Customer name" name="name" required placeholder="e.g. Priya, Perungudi" />
          <Field label="Rating (1–5)" name="rating" type="number" placeholder="Optional" />
          <div className="sm:col-span-2">
            <label className="label" htmlFor="text">Review</label>
            <textarea id="text" name="text" rows={3} required className="field" />
          </div>
          <div className="flex items-center gap-4 sm:col-span-2">
            <Check label="Publish now" name="isPublished" defaultChecked />
            <SubmitButton>Add review</SubmitButton>
          </div>
        </form>
      </Card>
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold">{r.name}{r.rating ? ` · ${r.rating}★` : ""}</p>
              <Badge value={r.isPublished ? "PUBLISHED" : "DRAFT"} />
            </div>
            <p className="mt-2 text-sm text-ink-soft">{r.text}</p>
            <div className="mt-3 flex gap-2 text-sm">
              <form action={toggleReview}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="value" value={String(!r.isPublished)} /><button className="rounded-lg px-2.5 py-1.5 font-semibold text-basil hover:bg-basil-soft">{r.isPublished ? "Hide" : "Publish"}</button></form>
              <form action={deleteReview}><input type="hidden" name="id" value={r.id} /><SubmitButton className="rounded-lg px-2.5 py-1.5 font-semibold text-tomato hover:bg-tomato/10" confirm="Delete this review?" pendingText="…">Delete</SubmitButton></form>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
