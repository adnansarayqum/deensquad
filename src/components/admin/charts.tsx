import Link from "next/link";

// Small charts for the admin overview: plain HTML and CSS bars from the design tokens, no library.
// Every bar has its numbers written next to it in words, so nothing depends on colour alone.

/** done = grass (coming, read, signed in); neutral = ink-muted; action = kit-orange (needs action); rest = the empty track. */
export type SegmentTone = "done" | "neutral" | "action" | "rest";

const fill: Record<Exclude<SegmentTone, "rest">, string> = {
  done: "bg-grass",
  neutral: "bg-ink-muted",
  action: "bg-kit-orange",
};

const swatch: Record<SegmentTone, string> = {
  ...fill,
  rest: "border border-ink-muted bg-line",
};

export type Segment = { label: string; value: number; tone: SegmentTone; href: string };

/**
 * One horizontal bar split into parts, with a legend that gives each part's number and word and
 * links to where it can be acted on. The "rest" part is left as the bar's empty track.
 */
export function StackedBar({ label, segments }: { label: string; segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const drawn = segments.filter((s) => s.tone !== "rest" && s.value > 0);
  return (
    <div className="flex flex-col gap-1">
      <div
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}
        className="flex h-3.5 w-full overflow-hidden rounded-pill bg-line"
      >
        {total > 0
          ? drawn.map((s, i) => (
              <div
                key={s.label}
                className={`h-full ${fill[s.tone as Exclude<SegmentTone, "rest">]} ${i < drawn.length - 1 || drawn.length < segments.length ? "border-r-2 border-paper" : ""}`}
                style={{ width: `${(s.value / total) * 100}%` }}
              />
            ))
          : null}
      </div>
      <ul className="flex flex-wrap gap-x-4">
        {segments.map((s) => (
          <li key={s.label}>
            <Link href={s.href} aria-label={`${s.value} ${s.label}`} className="inline-flex min-h-12 items-center gap-1.5 text-[14px]">
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-pill ${swatch[s.tone]}`} />
              <b className={`tabular-nums ${s.tone === "action" && s.value > 0 ? "text-kit-orange" : ""}`}>{s.value}</b>
              <span className={`underline decoration-line underline-offset-4 ${s.tone === "action" && s.value > 0 ? "font-bold text-kit-orange" : "text-ink"}`}>
                {s.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A thin bar for one percentage, with the figure written beside it. */
export function PercentBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div role="img" aria-label={label} className="h-2.5 min-w-16 flex-1 overflow-hidden rounded-pill bg-line">
        <div className="h-full rounded-pill bg-grass" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className="w-11 shrink-0 text-right text-[14px] font-bold tabular-nums">{pct}%</span>
    </div>
  );
}

export type Column = { key: string; value: number; label: string; detail: string; href: string };

/** Upright bars (e.g. check-ins at recent sessions), each with its number above and its label below. */
export function ColumnChart({ title, columns, unit }: { title: string; columns: Column[]; unit: string }) {
  const max = Math.max(1, ...columns.map((c) => c.value));
  return (
    <ol aria-label={title} className="flex h-44 items-stretch gap-1.5">
      {columns.map((c) => (
        <li key={c.key} className="min-w-0 flex-1">
          <Link
            href={c.href}
            aria-label={`${c.detail}: ${c.value} ${unit}`}
            className="flex h-full flex-col items-center gap-1 rounded-dash px-0.5 pt-1 hover:bg-cream"
          >
            <span className="text-[14px] font-bold tabular-nums">{c.value}</span>
            <span className="flex w-full flex-1 items-end justify-center">
              <span
                aria-hidden
                className={`w-full max-w-9 rounded-t-dash ${c.value > 0 ? "bg-grass" : "bg-ink-muted"}`}
                style={{ height: c.value > 0 ? `${(c.value / max) * 100}%` : "2px" }}
              />
            </span>
            <span className="text-center text-[12px] leading-4 text-ink-muted">{c.label}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** A big figure (Bebas) with a short label, linking to where it can be acted on. */
export function Figure({ value, label, href, action = false }: { value: string | number; label: string; href: string; action?: boolean }) {
  return (
    <Link href={href} aria-label={`${value} ${label}`} className="flex min-h-12 flex-col justify-between gap-1 rounded-dash border-2 border-line px-3 py-2.5 hover:bg-cream">
      <span className={`font-display text-[36px] leading-none tabular-nums ${action ? "text-kit-orange" : "text-ink"}`}>{value}</span>
      <span className={`text-[13px] leading-[18px] ${action ? "font-bold text-kit-orange" : "text-ink-muted"}`}>{label}</span>
    </Link>
  );
}
