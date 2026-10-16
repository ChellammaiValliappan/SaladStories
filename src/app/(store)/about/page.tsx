import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10">
      <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="text-5xl font-[800] text-basil-deep sm:text-6xl">Every bowl tells a story</h1>
          <div className="mt-6 space-y-4 text-lg text-ink-soft">
            <p>
              Salad Stories started with a simple idea: eating well on a busy weekday shouldn't mean settling for something bland.
              We make protein-focused salads and bowls — chicken, paneer, eggs, fresh vegetables, seeds and seasonal fruit —
              and bring them to your door in Taramani, Perungudi and Thoraipakkam.
            </p>
            <p>
              You choose how your bowl is built: the portion, the protein, the dressing and what to leave out. We list the ingredients
              on every bowl and publish nutrition figures only after they've been checked.
            </p>
            <p>Whether it's a lunch at your desk, an afternoon refuel after the gym or a light dinner, there's a bowl for it.</p>
          </div>
          <Link href="/menu" className="btn btn-primary mt-8">See today's menu</Link>
        </div>
        <Image src="/images/bowls/hair-fall-control-bowl.svg" alt="" width={420} height={420} unoptimized className="mx-auto w-3/4 lg:w-full" />
      </div>
    </div>
  );
}
