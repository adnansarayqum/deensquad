"use client";

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

export type Tip = { title: string; lines: { key: string; colour: string; value: string; detail: string }[] };

/**
 * The hover and keyboard layer over a chart's plot: a hairline that snaps to the nearest session and a tooltip with
 * every series at it. It only adds to the chart: the same numbers are in its table. Arrow keys move along once the
 * chart has focus; a tap does the same on a phone.
 */
export function ChartHover({ xs, tips, label, children }: { xs: number[]; tips: Tip[]; label: string; children: ReactNode }) {
  const [at, setAt] = useState<number | null>(null);
  const [byKey, setByKey] = useState(false);

  const nearest = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    let best = 0;
    xs.forEach((v, i) => {
      if (Math.abs(v - x) < Math.abs(xs[best] - x)) best = i;
    });
    setByKey(false);
    setAt(best);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = xs.length - 1;
    const moves: Record<string, number> = { ArrowLeft: Math.max(0, (at ?? last) - 1), ArrowRight: Math.min(last, (at ?? last) + 1), Home: 0, End: last };
    if (!(e.key in moves)) return;
    e.preventDefault();
    setByKey(true);
    setAt(moves[e.key]);
  };

  const tip = at === null ? null : tips[at];
  const x = at === null ? 0 : xs[at];
  // Kept inside the plot: anchored left of the line near the right edge, right of it near the left.
  const shift = x > 60 ? "-100%" : x < 40 ? "0" : "-50%";

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={label}
      onPointerMove={nearest}
      onPointerDown={nearest}
      onPointerLeave={() => setAt(null)}
      onFocus={() => setAt((v) => v ?? xs.length - 1)}
      onBlur={() => setAt(null)}
      onKeyDown={onKeyDown}
      className="absolute inset-0 touch-pan-y rounded-dash"
    >
      {children}
      {tip ? (
        <>
          <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-muted" style={{ left: `${x}%` }} />
          <div
            // Read out only when moved with the keys: a pointer passing over shouldn't talk.
            aria-live={byKey ? "polite" : "off"}
            className="pointer-events-none absolute top-0 z-10 flex w-max max-w-[15rem] flex-col gap-1 rounded-dash border-2 border-line bg-paper px-2.5 py-2 text-[13px] leading-[18px]"
            style={{ left: `${x}%`, transform: `translateX(${shift})` }}
          >
            <span className="font-bold">{tip.title}</span>
            {tip.lines.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-pill" style={{ background: l.colour }} />
                <b className="tabular-nums">{l.value}</b>
                <span className="text-ink-muted">{l.detail}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
