import { formatINR } from "@/lib/money";

export function Price({ base, discount, className = "" }: { base: number; discount?: number | null; className?: string }) {
  if (discount != null && discount < base) {
    return (
      <span className={className}>
        <span className="font-bold">{formatINR(discount)}</span>{" "}
        <s className="text-sm font-normal text-ink-soft">{formatINR(base)}</s>
      </span>
    );
  }
  return <span className={`font-bold ${className}`}>{formatINR(base)}</span>;
}
