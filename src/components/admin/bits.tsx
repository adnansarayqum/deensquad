import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

/**
 * The one page header for every staff page: an optional text back link, the title (Bebas), an optional
 * one-line subtitle in ink-muted, and an actions slot on the right (primary `btn-chunky btn-grass`, secondary
 * `btn-paper`). `children` go under the title row (group tabs, notices) and share its width.
 * A div, not a `<header>`: the shell's phone header is the page's one header element.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {back ? (
        <Link href={back.href} className="inline-flex min-h-11 items-center self-start text-sm font-bold text-grass-text">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">{title}</h1>
          {subtitle ? <p className="text-[15px] leading-[22px] text-ink-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
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

/** The one card: 2px line border on paper, a 17px heading, optional aside on the heading's right. */
export function Section({ title, children, aside, className = "" }: { title: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-extrabold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A sub-label inside a card (above a list or a bar): small caps in ink-muted. */
export function SubLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-label text-ink-muted uppercase">{children}</h3>;
}

/**
 * A card whose body is folded behind a toggle row with the title, so a form used now and then (Add sessions, Add
 * staff) doesn't push the list it belongs to off the first screen. `open` starts it unfolded (a club with nothing
 * to list yet). CSS only: a hidden checkbox and its label, so it works without JavaScript and the body is in the
 * page once. e2e opens it with `unfold` in e2e/helpers.ts.
 */
export function FoldCard({ id, title, open = false, children }: { id: string; title: string; open?: boolean; children: ReactNode }) {
  return (
    <section className="rounded-app border-2 border-line bg-paper p-4">
      <input id={id} type="checkbox" defaultChecked={open} className="peer sr-only" />
      <label
        htmlFor={id}
        className="flex min-h-12 cursor-pointer items-center justify-between gap-2 text-[17px] font-extrabold peer-checked:[&_svg]:rotate-180 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]"
      >
        {title}
        <ChevronDown aria-hidden size={20} className="shrink-0 text-ink-muted transition-transform" />
      </label>
      <div className="hidden pt-3 peer-checked:block">{children}</div>
    </section>
  );
}

/** Read-receipt bar: how many of the audience have tapped "I've read this". */
export function ReadBar({ read, total, groupsOnly = false }: { read: number; total: number; /** A group coach's groups only. */ groupsOnly?: boolean }) {
  const pct = total ? Math.round((read / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <div
        role="progressbar"
        aria-label={`${read} of ${total} parents${groupsOnly ? " in your groups" : ""} have read it`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={read}
        className="h-3 min-w-0 flex-1 overflow-hidden rounded-pill bg-line"
      >
        <div className="h-full rounded-pill bg-grass" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {groupsOnly ? "Your groups: " : ""}
        {read} of {total} read
      </span>
    </div>
  );
}
