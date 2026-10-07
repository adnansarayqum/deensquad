import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AttendanceChartData } from "@/lib/admin/overview";
import { shortDay } from "@/lib/dates";
import { ChartHover, type Tip } from "./ChartHover";

// Charts for the admin overview: plain HTML, CSS and inline SVG from the design tokens, no library. Colour follows
// the club's meanings (grass = done/coming/read, neutral greys for the rest; kit-orange only on "Needs you"), and
// every chart has its numbers in words beside it or a table, so nothing depends on colour alone.

/** done = grass (coming, active); neutral = ink-muted; strong = ink (e.g. overdue: still needs telling apart); rest = the empty track. */
export type SegmentTone = "done" | "neutral" | "strong" | "rest";

const fill: Record<Exclude<SegmentTone, "rest">, string> = {
  done: "bg-grass",
  neutral: "bg-ink-muted",
  strong: "bg-ink",
};

const swatch: Record<SegmentTone, string> = {
  ...fill,
  rest: "border border-ink-muted bg-line",
};

export type Segment = { label: string; value: number; tone: SegmentTone; href?: string };

const dayMonth = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(new Date(iso));

/** One horizontal bar split into parts; the "rest" part is left as the bar's empty track. 2px gaps keep parts apart. */
export function Bar({ label, segments, thin = false }: { label: string; segments: Segment[]; thin?: boolean }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const drawn = segments.filter((s) => s.tone !== "rest" && s.value > 0);
  return (
    <span
      role="img"
      aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}
      className={`flex w-full overflow-hidden rounded-pill bg-line ${thin ? "h-2" : "h-3"}`}
    >
      {total > 0
        ? drawn.map((s, i) => (
            <span
              key={s.label}
              className={`h-full ${fill[s.tone as Exclude<SegmentTone, "rest">]} ${i < drawn.length - 1 || drawn.length < segments.length ? "border-r-2 border-paper" : ""}`}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ))
        : null}
    </span>
  );
}

function Key({ s }: { s: Segment }) {
  return (
    <>
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-pill ${swatch[s.tone]}`} />
      <b className="tabular-nums">{s.value}</b> <span>{s.label}</span>
    </>
  );
}

/**
 * A bar with a legend that gives each part's number and word, each linking to where it can be acted on. `hideZero`
 * leaves parts at 0 out of the legend (the bar is drawn the same).
 */
export function StackedBar({ label, segments, hideZero = false }: { label: string; segments: Segment[]; hideZero?: boolean }) {
  const legend = hideZero ? segments.filter((s) => s.value > 0) : segments;
  return (
    <div className="flex flex-col gap-1">
      <Bar label={label} segments={segments} />
      <ul className="flex flex-wrap gap-x-4">
        {legend.map((s) => (
          <li key={s.label}>
            {s.href ? (
              <Link href={s.href} aria-label={`${s.value} ${s.label}`} className="inline-flex min-h-12 items-center gap-1.5 text-[14px] underline decoration-line underline-offset-4">
                <Key s={s} />
              </Link>
            ) : (
              <span className="inline-flex min-h-12 items-center gap-1.5 text-[14px]">
                <Key s={s} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A whole block that links somewhere: its heading beside a bar, the bar's numbers on one line under it (`aside`, e.g. a
 * date, on the line above when given). The link's name says it all, so a screen reader hears one sentence.
 */
export function BarLink({ href, name, heading, aside, label, segments }: { href: string; name: string; heading: ReactNode; aside?: ReactNode; label: string; segments: Segment[] }) {
  return (
    <Link href={href} aria-label={name} className="-mx-2 flex min-h-12 flex-col justify-center gap-1.5 rounded-dash px-2 py-1.5 hover:bg-cream">
      {aside ? <span className="text-[13px] text-ink-muted">{aside}</span> : null}
      <span className="flex items-center gap-2">
        <b className="w-11 shrink-0 text-[14px]">{heading}</b>
        <Bar label={label} segments={segments} />
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <Key s={s} />
          </span>
        ))}
      </span>
    </Link>
  );
}

export type HBar = { key: string; label: string; value: number; href: string };

/**
 * Horizontal bars of counts out of `max` (e.g. children with each to-do left), neutral fill, the count at the bar's
 * end. Each row links to its list.
 */
export function HBarList({ title, max, rows }: { title: string; max: number; rows: HBar[] }) {
  return (
    <ul aria-label={title} className="flex flex-col">
      {rows.map((r) => (
        <li key={r.key}>
          <Link
            href={r.href}
            aria-label={`${r.value} ${r.label}`}
            className="-mx-2 flex min-h-12 flex-col justify-center gap-1 rounded-dash px-2 py-1 hover:bg-cream min-[360px]:grid min-[360px]:grid-cols-[8.5rem_minmax(0,1fr)] min-[360px]:items-center min-[360px]:gap-2"
          >
            <span className="text-[14px] leading-5">{r.label}</span>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-3 shrink-0 rounded-r-[4px] bg-ink-muted"
                style={{ width: `calc((100% - 2.5rem) * ${max > 0 ? Math.min(1, r.value / max) : 0})`, minWidth: r.value > 0 ? "2px" : 0 }}
              />
              <b className="text-[14px] tabular-nums">{r.value}</b>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A small trend line (de-emphasised) with the latest point in grass. Decoration beside a figure: aria-hidden. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = (v: number) => (hi === lo ? 50 : 90 - ((v - lo) / (hi - lo)) * 80);
  const x = (i: number) => (i / (values.length - 1)) * 100;
  return (
    <span aria-hidden className="relative block h-6 w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke="var(--ink-muted)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-grass" style={{ left: "100%", top: `${y(values.at(-1)!)}%`, boxShadow: "0 0 0 2px var(--paper)" }} />
    </span>
  );
}

/** A headline figure: a short label, a big number (Bebas), and a small picture of it; the whole tile is the link. */
export function StatTile({ href, name, label, value, of, children }: { href: string; name: string; label: string; value: string; of?: string; children?: ReactNode }) {
  return (
    <Link href={href} aria-label={name} className="flex min-h-12 w-full min-w-0 flex-col gap-1.5 rounded-app border-2 border-line bg-paper p-3 hover:bg-cream">
      <span className="text-[13px] leading-[18px] font-bold text-ink-muted">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-display text-[40px] leading-none">{value}</span>
        {of ? <span className="text-[13px] text-ink-muted">{of}</span> : null}
      </span>
      <span className="mt-auto block">{children}</span>
    </Link>
  );
}

/** One row of "Needs you": the count big in kit-orange, a few words, a chevron. The whole row is the link. */
export function NeedLink({ href, count, text }: { href: string; count: number; text: string }) {
  return (
    <Link href={href} aria-label={`${count} ${text}`} className="-mx-2 flex min-h-12 items-center gap-2.5 rounded-dash px-2 py-1 hover:bg-cream">
      <span className="w-10 shrink-0 text-right font-display text-[30px] leading-none text-kit-orange">{count}</span>
      <span className="min-w-0 flex-1 text-[15px] leading-5 font-bold">{text}</span>
      <ChevronRight aria-hidden size={18} className="-mr-1 shrink-0 text-ink-muted" />
    </Link>
  );
}

const PLOT_H = 128;
const pctText = (n: number) => `${n}%`;

/**
 * Attendance rate per session this season: a 0–100% line per series, three hairline gridlines, the latest value
 * labelled at the end of each line (labels that would collide are left to the legend), a hover/keyboard tooltip and
 * a "Show as table" twin with every number.
 */
export function AttendanceChart({ data, title }: { data: AttendanceChartData; title: string }) {
  const n = data.sessions.length;
  const xs = data.sessions.map((_, i) => (n === 1 ? 50 : 3 + (i / (n - 1)) * 94));
  const multi = data.series.length > 1;
  const showDots = n <= 16;

  // End labels: each series' latest value, placed by its height; one that would sit within 16px of another is dropped.
  const ends = data.series
    .map((s) => {
      const i = s.points.findLastIndex((p) => p !== null);
      return i < 0 ? null : { s, pct: s.points[i]!.pct, top: (1 - s.points[i]!.pct / 100) * PLOT_H };
    })
    .filter((e) => e !== null)
    .sort((a, b) => a.top - b.top);
  const placed: typeof ends = [];
  for (const e of ends) if (placed.every((p) => Math.abs(p.top - e.top) >= 16)) placed.push(e);

  const tips: Tip[] = data.sessions.map((session, i) => ({
    title: `${session.title}, ${shortDay(session.startsAt)}`,
    lines: data.series.flatMap((s) => {
      const p = s.points[i];
      return p ? [{ key: s.key, colour: s.colour, value: pctText(p.pct), detail: `${multi ? `${s.label} · ` : ""}${p.checkedIn} of ${p.expected}` }] : [];
    }),
  }));

  // Lines break where a group's register wasn't taken.
  const runs = (s: AttendanceChartData["series"][number]) => {
    const out: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    s.points.forEach((p, i) => {
      if (p) run.push({ x: xs[i], y: 100 - p.pct });
      else if (run.length) {
        out.push(run);
        run = [];
      }
    });
    if (run.length) out.push(run);
    return out;
  };

  return (
    <figure className="flex flex-col gap-2">
      {multi ? (
        <ul aria-label="Groups" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {data.series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded-pill" style={{ background: s.colour }} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(2.75rem,auto)]" style={{ gridTemplateRows: `${PLOT_H}px auto` }}>
        <div aria-hidden className="relative text-[12px] text-ink-muted tabular-nums">
          {[100, 50, 0].map((v) => (
            <span key={v} className="absolute right-1.5 -translate-y-1/2" style={{ top: `${100 - v}%` }}>
              {v}%
            </span>
          ))}
        </div>
        <div className="relative">
          {[0, 50, 100].map((v) => (
            <span key={v} aria-hidden className="absolute right-0 left-0 h-px bg-line" style={{ top: `${v}%` }} />
          ))}
          <ChartHover xs={xs} tips={tips} label={`${title}. Arrow keys move between sessions.`}>
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {data.series.map((s) =>
                runs(s).map((run, k) => (
                  <g key={`${s.key}-${k}`}>
                    {!multi && run.length > 1 ? (
                      <polygon points={`${run[0].x},100 ${run.map((p) => `${p.x},${p.y}`).join(" ")} ${run.at(-1)!.x},100`} fill={s.colour} fillOpacity={0.1} />
                    ) : null}
                    <polyline
                      points={run.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={s.colour}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                )),
              )}
            </svg>
            {data.series.map((s) =>
              s.points.map((p, i) =>
                p && (showDots || i === s.points.findLastIndex((q) => q !== null)) ? (
                  <span
                    key={`${s.key}-${i}`}
                    aria-hidden
                    className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-pill"
                    style={{ left: `${xs[i]}%`, top: `${100 - p.pct}%`, background: s.colour, boxShadow: "0 0 0 2px var(--paper)" }}
                  />
                ) : null,
              ),
            )}
          </ChartHover>
        </div>
        <div aria-hidden className="relative">
          {placed.map((e) => (
            <span key={e.s.key} className="absolute left-2 -translate-y-1/2 text-[12px] leading-4 font-bold whitespace-nowrap tabular-nums" style={{ top: e.top }}>
              {multi ? `${e.s.label} ` : ""}
              {pctText(e.pct)}
            </span>
          ))}
        </div>
        <div aria-hidden className="col-start-2 flex justify-between pt-1 text-[12px] text-ink-muted">
          {n === 1 ? <span className="mx-auto">{dayMonth(data.sessions[0].startsAt)}</span> : null}
          {n > 1 ? (
            <>
              <span>{dayMonth(data.sessions[0].startsAt)}</span>
              <span>{dayMonth(data.sessions[n - 1].startsAt)}</span>
            </>
          ) : null}
        </div>
      </div>
      <details className="group">
        <summary className="inline-flex min-h-12 cursor-pointer items-center text-[14px] font-bold text-grass-text underline underline-offset-4">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-left text-label text-ink-muted uppercase">
                <th scope="col" className="py-1 pr-3 font-bold">
                  Session
                </th>
                {data.series.map((s) => (
                  <th key={s.key} scope="col" className="py-1 pr-3 text-right font-bold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((session, i) => (
                <tr key={session.id} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {session.title}, {shortDay(session.startsAt)}
                  </th>
                  {data.series.map((s) => {
                    const p = s.points[i];
                    return (
                      <td key={s.key} className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">
                        {p ? (
                          <>
                            <b>{pctText(p.pct)}</b> <span className="text-ink-muted">{p.checkedIn} of {p.expected}</span>
                          </>
                        ) : (
                          <span className="text-ink-muted">No register</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
