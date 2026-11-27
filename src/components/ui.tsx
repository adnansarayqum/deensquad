import type { ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * Icon sizes and strokes (lucide). 16 beside small or meta text and in pills, 20 in buttons and list rows, 24 for
 * navigation and the round header buttons, 32 for a status icon that leads a card (scanner, no signal); larger only
 * for pictures. Stroke 2, `active` for the lit tab, `tick` for ticks. `src/lib/design-system.test.ts` keeps to it.
 */
export const ICON = { sm: 16, md: 20, lg: 24, xl: 32 } as const;
export const ICON_STROKE = { normal: 2, active: 2.5, tick: 3 } as const;

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-small leading-5 font-bold text-ink-muted ${className}`}>{children}</p>;
}

type PillTone = "done" | "action" | "gold" | "neutral";
const pillTone: Record<PillTone, string> = {
  done: "bg-grass-tint text-grass-text",
  action: "bg-orange-tint text-kit-orange",
  gold: "bg-gold-tint text-gold-text",
  neutral: "border border-line bg-paper text-ink-muted",
};

/** Status pill. Always carries a word, never colour alone. */
export function Pill({ tone, children, icon = false }: { tone: PillTone; children: ReactNode; icon?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-meta leading-5 font-bold ${pillTone[tone]}`}>
      {icon && tone === "done" ? <Check aria-hidden size={16} strokeWidth={3} /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className = "", tone = "paper" }: { children: ReactNode; className?: string; tone?: "paper" | "gold" | "grass" }) {
  const tones = {
    paper: "bg-paper shadow-card",
    gold: "bg-gold-tint",
    grass: "bg-grass-tint",
  };
  return <div className={`rounded-app ${tones[tone]} ${className}`}>{children}</div>;
}

/** Inset progress bar used for checklists, challenges and headcounts. */
export function Progress({
  value,
  max,
  label,
  onDark = false,
  className = "min-w-0 flex-1",
}: {
  value: number;
  max: number;
  label: string;
  onDark?: boolean;
  /** Layout classes. Defaults to filling a row; pass "w-full" when the bar sits in a column. */
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`h-4 shrink-0 overflow-hidden rounded-pill p-[3px] ${onDark ? "bg-pitch-deep" : "bg-line"} ${className}`}
    >
      <div className="h-full rounded-pill bg-grass transition-[width] duration-400" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * The parent screens' header: light, on the page's own ground, so the content (not a green band) leads. Back links,
 * titles and lines inside use ink / ink-muted. `stripes` and `deep` are kept for the call sites and no longer draw.
 */
export function AppHeader({ children }: { children: ReactNode; stripes?: boolean; deep?: boolean }) {
  return (
    <header className="relative px-4 pt-[max(env(safe-area-inset-top),20px)] pb-1 text-ink">
      <div className="relative flex flex-col gap-2 pt-4">{children}</div>
    </header>
  );
}

/** A screen's title on parent screens: 30px bold, tight, left-aligned. */
export const TITLE = "text-title leading-9 font-bold tracking-[-0.02em]";

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className={`pr-36 max-[374px]:pr-28 ${TITLE}`}>{children}</h1>;
}
