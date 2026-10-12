import { CATEGORIES, CATEGORY_KEYS, type Scores } from "@/lib/progress/ratings";
import { CENTRE, OUTER, VIEW_H, VIEW_W, labelPlacement, pointAt, ring, toPoints, vertices } from "@/lib/progress/pentagon";

// The ratings pentagon: inline SVG from the design tokens, no library. The last 3 months is a filled shape in chart-1
// (an identity colour, never a status) with dots at its corners; the 3 months before is a dashed outline in ink-muted
// only. Hairline rings at 1 to 5 (a 1 sits on a small inner ring, so it's still visible). The SVG is one image with a
// summary label; every number is also in the list beside it, so nothing depends on the picture or its colours.

const LINES: Record<string, string[]> = {
  technique: ["Technique"],
  game_understanding: ["Game", "understanding"],
  physical: ["Physical"],
  attitude: ["Attitude and", "effort"],
  teamwork: ["Teamwork"],
};

const LINE_H = 14;

export function Pentagon({ current, previous, label, className = "" }: { current: Scores; previous: Scores | null; label: string; className?: string }) {
  const now = vertices(CATEGORY_KEYS.map((k) => current[k]));
  const before = previous ? vertices(CATEGORY_KEYS.map((k) => previous[k])) : null;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className={`block h-auto w-full max-w-[360px] ${className}`}>
      <g fill="none" stroke="var(--line)" strokeWidth={1}>
        {[1, 2, 3, 4, 5].map((s) => (
          <polygon key={s} points={toPoints(ring(s))} />
        ))}
        {CATEGORIES.map((c, i) => {
          const end = pointAt(i, OUTER);
          return <line key={c.key} x1={CENTRE.x} y1={CENTRE.y} x2={end.x} y2={end.y} />;
        })}
      </g>
      {before ? (
        <polygon points={toPoints(before)} fill="none" stroke="var(--ink-muted)" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" />
      ) : null}
      <polygon points={toPoints(now)} fill="var(--chart-1)" fillOpacity={0.18} stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" />
      {now.map((p, i) => (
        <circle key={CATEGORIES[i].key} cx={p.x} cy={p.y} r={3.5} fill="var(--chart-1)" stroke="var(--paper)" strokeWidth={1.5} />
      ))}
      <g fill="var(--ink)" fontSize={12} fontWeight={700}>
        {CATEGORIES.map((c, i) => {
          const at = labelPlacement(i);
          const lines = LINES[c.key];
          // Up: the last line sits on the anchor; down: the first does; centre: the block is centred on it.
          const first = at.grow === "up" ? at.y - (lines.length - 1) * LINE_H : at.grow === "down" ? at.y + 9 : at.y + 4 - ((lines.length - 1) * LINE_H) / 2;
          return (
            <text key={c.key} x={at.x} y={first} textAnchor={at.anchor}>
              {lines.map((line, k) => (
                <tspan key={line} x={at.x} dy={k === 0 ? 0 : LINE_H}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

/** The key under the pentagon: what the solid shape and the dashed outline stand for. */
export function PentagonKey({ hasPrevious }: { hasPrevious: boolean }) {
  return (
    <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
      <li className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-pill bg-chart-1" />
        Last 3 months
      </li>
      {hasPrevious ? (
        <li className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-ink-muted" />
          The 3 months before
        </li>
      ) : null}
    </ul>
  );
}
