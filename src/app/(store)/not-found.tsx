import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-5xl font-[800] text-basil-deep">This page wandered off</h1>
      <p className="mt-3 text-ink-soft">The link may be old or mistyped. The menu is a good place to start again.</p>
      <Link href="/menu" className="btn btn-primary mt-6">Go to the menu</Link>
    </div>
  );
}
