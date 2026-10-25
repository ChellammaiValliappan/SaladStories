import { formatINR } from "@/lib/money";
import { formatDateLong } from "@/lib/time";

type Day = { date: string; collected: number; spent: number };

/** Money in vs money out per day (per week for long ranges). Paired bars, one axis, legend + table view. */
export function MoneyChart({ daily }: { daily: Day[] }) {
  const weekly = daily.length > 62;
  const buckets: { label: string; from: string; collected: number; spent: number }[] = [];
  for (const d of daily) {
    const key = weekly ? mondayOf(d.date) : d.date;
    const last = buckets[buckets.length - 1];
    if (last && last.from === key) {
      last.collected += d.collected;
      last.spent += d.spent;
    } else buckets.push({ label: key, from: key, collected: d.collected, spent: d.spent });
  }
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.collected, b.spent)));
  const W = 640;
  const H = 200;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const step = (W - pad.l - pad.r) / Math.max(1, buckets.length);
  const bw = Math.max(1.5, Math.min(14, (step - 3) / 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - Math.max(0, v) / max);
  const base = y(0);
  const ticks = [0, 0.5, 1].map((f) => max * f);
  const labelEvery = Math.ceil(buckets.length / 6);
  const empty = buckets.every((b) => !b.collected && !b.spent);
  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-4 text-xs font-semibold text-ink-soft" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#1f6b3a" }} /> Money received</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#f08a24" }} /> Expenses</span>
        <span>{weekly ? "per week" : "per day"} · up to {formatINR(max)}</span>
      </div>
      {empty ? (
        <p className="rounded-xl bg-crate p-6 text-center text-sm text-ink-soft">No money in or out in this period yet.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Money received and expenses ${weekly ? "per week" : "per day"}. Table below.`}>
          {ticks.map((t) => (
            <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-line" strokeWidth={t === 0 ? 1 : 0.6} strokeDasharray={t === 0 ? undefined : "3 4"} />
          ))}
          {buckets.map((b, i) => {
            const x = pad.l + i * step + (step - (bw * 2 + 2)) / 2;
            const tip = `${weekly ? "Week of " : ""}${formatDateLong(b.from)}: received ${formatINR(b.collected)}, expenses ${formatINR(b.spent)}`;
            return (
              <g key={b.from}>
                <title>{tip}</title>
                <rect x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" />
                {b.collected > 0 && <path d={bar(x, y(b.collected), bw, base)} fill="#1f6b3a" />}
                {b.spent > 0 && <path d={bar(x + bw + 2, y(b.spent), bw, base)} fill="#f08a24" />}
                {i % labelEvery === 0 && (
                  <text x={pad.l + i * step + step / 2} y={H - 6} textAnchor="middle" className="fill-current text-ink-soft" fontSize="10">
                    {new Date(`${b.from}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-ink-soft">Show as a table</summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-left">
            <thead><tr className="text-ink-soft"><th className="py-1">{weekly ? "Week of" : "Date"}</th><th className="py-1 text-right">Received</th><th className="py-1 text-right">Expenses</th><th className="py-1 text-right">Net</th></tr></thead>
            <tbody>
              {buckets.filter((b) => b.collected || b.spent).map((b) => (
                <tr key={b.from} className="border-t border-line">
                  <td className="py-1">{formatDateLong(b.from)}</td>
                  <td className="py-1 text-right">{formatINR(b.collected)}</td>
                  <td className="py-1 text-right">{formatINR(b.spent)}</td>
                  <td className={`py-1 text-right font-semibold ${b.collected - b.spent < 0 ? "text-tomato" : ""}`}>{formatINR(b.collected - b.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Bar with a 4px rounded top, square at the baseline. */
function bar(x: number, top: number, w: number, base: number) {
  const r = Math.min(4, w / 2, (base - top) / 2);
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

function mondayOf(d: string) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
