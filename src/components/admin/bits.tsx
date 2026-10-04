import type { ReactNode } from "react";

/** Page title for admin screens. */
export function AdminTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">{children}</h1>
      {action}
    </div>
  );
}

export function Notice({ tone = "done", children }: { tone?: "done" | "action"; children: ReactNode }) {
  return (
    <p role="status" className={`rounded-app px-3.5 py-3 text-[15px] leading-[22px] ${tone === "done" ? "bg-grass-tint font-bold text-grass-text" : "bg-orange-tint text-ink"}`}>
      {children}
    </p>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-extrabold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Read-receipt bar: how many of the audience have tapped "I've read this". */
export function ReadBar({ read, total }: { read: number; total: number }) {
  const pct = total ? Math.round((read / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <div
        role="progressbar"
        aria-label={`${read} of ${total} parents have read it`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={read}
        className="h-3 min-w-0 flex-1 overflow-hidden rounded-pill bg-line"
      >
        <div className="h-full rounded-pill bg-grass" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {read} of {total} read
      </span>
    </div>
  );
}
