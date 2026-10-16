export function ContentPage({ title, intro, children, updated }: { title: string; intro?: string; children: React.ReactNode; updated?: string }) {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-10">
      <h1 className="text-5xl font-[800] text-basil-deep">{title}</h1>
      {intro && <p className="mt-4 text-lg text-ink-soft">{intro}</p>}
      {updated && <p className="mt-2 text-sm text-ink-soft">Last updated: {updated}</p>}
      <div className="prose-policy mt-6 max-w-[68ch]">{children}</div>
    </article>
  );
}
