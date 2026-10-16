import Link from "next/link";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#1f6b3a" />
      <path d="M11 33h42a21 21 0 0 1-42 0Z" fill="#fffdf7" />
      <path d="M32 30c-2-9 3-16 13-18-1 10-6 16-13 18Z" fill="#a8d14f" />
      <path d="M30 30c-6-4-14-3-17 2 6 3 12 2 17-2Z" fill="#a8d14f" />
      <circle cx="23" cy="34" r="4" fill="#e4472b" />
      <circle cx="38" cy="35" r="3.5" fill="#f5b82e" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Salad Stories home">
      <LogoMark />
      <span
        className={`font-display text-[1.35rem] font-[750] leading-none tracking-[-0.03em] ${light ? "text-white" : "text-basil-deep"}`}
        style={{ fontStretch: "92%" }}
      >
        Salad Stories
      </span>
    </Link>
  );
}
