import type { ReactNode } from "react";
import { Check } from "lucide-react";

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-label uppercase text-ink-muted ${className}`}>{children}</p>;
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
    <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-label uppercase ${pillTone[tone]}`}>
      {icon && tone === "done" ? <Check aria-hidden size={13} strokeWidth={3} /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className = "", tone = "paper" }: { children: ReactNode; className?: string; tone?: "paper" | "gold" | "grass" }) {
  const tones = {
    paper: "border-2 border-line bg-paper",
    gold: "border-2 border-crest-gold bg-gold-tint",
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

/** Green app header with rounded bottom corners. Optional mowing stripes behind the title. */
export function AppHeader({ children, stripes = false, deep = false }: { children: ReactNode; stripes?: boolean; deep?: boolean }) {
  return (
    <header
      className={`relative overflow-hidden rounded-b-[24px] px-4 pt-[max(env(safe-area-inset-top),20px)] pb-5 text-on-pitch ${
        deep ? "bg-pitch-deep" : "bg-pitch"
      }`}
    >
      {stripes ? <div aria-hidden className={`stripes-v absolute inset-0 ${deep ? "opacity-60" : ""}`} /> : null}
      <div className="relative flex flex-col gap-3 pt-6">{children}</div>
    </header>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.02em]">{children}</h1>;
}
