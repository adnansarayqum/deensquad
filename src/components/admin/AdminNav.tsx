"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, ClipboardList, FileText, House, Inbox, Megaphone, MoreHorizontal, HeartHandshake, PartyPopper, ShoppingBag, Star, UserCog, Users } from "lucide-react";
import { ICON_STROKE } from "@/components/ui";

/** Every staff page, in the order the club works through them. Coaches don't see the admin-only ones. */
export const STAFF_NAV = [
  { href: "/admin", label: "Overview", exact: true, tab: true, icon: House, section: "Today", also: ["/admin/assistant", "/admin/app-use"] },
  { href: "/coach", label: "Register", exact: true, tab: true, icon: ClipboardCheck, section: "Today" },
  { href: "/admin/families", label: "Families", tab: true, icon: Users, section: "Families and messages" },
  { href: "/admin/messages", label: "Inbox", tab: true, icon: Inbox, section: "Families and messages" },
  { href: "/admin/news", label: "Announcements", icon: Megaphone, hint: "Posts to many families", section: "Families and messages" },
  { href: "/admin/sessions", label: "Sessions", icon: CalendarDays, hint: "Add, edit, cancel", section: "Training" },
  { href: "/coach/plans", label: "Plans", icon: ClipboardList, section: "Training" },
  { href: "/coach/practice", label: "Practice sheets", icon: FileText, section: "Training" },
  // Ratings (/coach/ratings) are reached from Points and stars, so it stays lit there.
  { href: "/coach/awards", label: "Points and stars", also: ["/coach/ratings"], icon: Star, section: "Training" },
  { href: "/admin/shop", label: "Shop", adminOnly: true, icon: ShoppingBag, section: "Club" },
  { href: "/admin/community", label: "Community", adminOnly: true, icon: PartyPopper, section: "Club" },
  { href: "/admin/sponsors", label: "Sponsors", adminOnly: true, icon: HeartHandshake, section: "Club" },
  { href: "/admin/staff", label: "Staff", adminOnly: true, icon: UserCog, section: "Club" },
] as const;

/**
 * The staff sections: a list down the desktop sidebar, or on phones a bottom tab bar like the parents' app (UX
 * review, 8 Nov 2026: the eleven pills in the phone header had grown to four rows, a third of the screen above the
 * register). The tabs are Overview, Register, Families and Inbox (`tab: true`); More opens the rest as a sheet
 * above the bar. It's a <details>, so it opens without JavaScript; with it, it closes on a tap outside, Escape and
 * moving to another page.
 */
export function AdminNav({ isAdmin, layout = "tabs", unreadMessages = 0 }: { isAdmin: boolean; layout?: "tabs" | "sidebar"; unreadMessages?: number }) {
  const path = usePathname();
  const items = STAFF_NAV.filter((item) => isAdmin || !("adminOnly" in item && item.adminOnly));
  // `also` keeps an item lit on a page reached from it (the assistant from the Overview, ratings from Points and stars).
  const isActive = (item: (typeof STAFF_NAV)[number]) =>
    ("exact" in item && item.exact ? path === item.href : path.startsWith(item.href)) || ("also" in item && item.also.some((a) => path.startsWith(a)));
  // Inbox carries how many conversations have a parent's message this person hasn't read. The link is named
  // "Inbox, 3 unread" (an aria-label, so it reads the same everywhere); the badge shows the number.
  const unread = (item: (typeof STAFF_NAV)[number]) => item.href === "/admin/messages" && unreadMessages > 0;
  const label = (item: (typeof STAFF_NAV)[number]) => (unread(item) ? `${item.label}, ${unreadMessages} unread` : undefined);
  const badge = (item: (typeof STAFF_NAV)[number]) =>
    unread(item) ? (
      <span aria-hidden className="ml-1.5 inline-grid h-6 min-w-6 place-items-center rounded-pill bg-kit-orange px-1.5 text-meta font-bold text-on-orange">
        {unreadMessages}
      </span>
    ) : null;

  if (layout === "sidebar") {
    return (
      <nav aria-label="Club admin">
        {/* Thirteen items read as one long list: grouped under quiet headings (admin review, 23 Nov 2026). */}
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => {
            const active = isActive(item);
            const heading = i === 0 || items[i - 1].section !== item.section ? item.section : null;
            return (
              <li key={item.href} className={heading && i > 0 ? "mt-3" : undefined}>
                {heading ? <p className="px-3 pb-1 text-meta font-bold text-on-pitch-muted">{heading}</p> : null}
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label(item)}
                  className={`flex min-h-12 items-center rounded-dash px-3 text-small font-bold ${
                    active ? "bg-floodlight text-on-gold" : "text-on-pitch hover:bg-pitch-deep"
                  }`}
                >
                  {item.label}
                  {badge(item)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return <TabBar items={items} isActive={isActive} label={label} unreadMessages={unreadMessages} />;
}

type Item = (typeof STAFF_NAV)[number];

function TabBar({ items, isActive, label, unreadMessages }: { items: readonly Item[]; isActive: (i: Item) => boolean; label: (i: Item) => string | undefined; unreadMessages: number }) {
  const path = usePathname();
  const more = useRef<HTMLDetailsElement>(null);
  const bar = useRef<HTMLElement>(null);
  const tabs = items.filter((i) => "tab" in i && i.tab);
  const rest = items.filter((i) => !("tab" in i && i.tab));
  const moreActive = rest.some(isActive);

  // Moving to another page closes More.
  useEffect(() => {
    if (more.current) more.current.open = false;
  }, [path]);
  // A tap outside the sheet or Escape closes it too.
  useEffect(() => {
    const close = (e: Event) => {
      const d = more.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        d.open = false;
        d.querySelector("summary")?.focus();
      } else if (!d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, []);
  // The page's bottom padding and the sticky Save bars sit above the tab bar: tell them its real height (0 on a
  // computer, where the bar is hidden), as the parents' bar does with --tab-bar-height.
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--staff-bar-height", `${Math.ceil(el.getBoundingClientRect().height)}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--staff-bar-height");
    };
  }, []);

  const tabClass = (on: boolean) => `relative flex min-h-12 w-full flex-col items-center gap-0.5 py-1 text-meta font-bold ${on ? "text-grass-text" : "text-ink-muted"}`;
  const iconPill = (on: boolean) => `grid h-8 w-14 place-items-center rounded-pill transition-colors ${on ? "bg-grass-tint" : ""}`;
  return (
    <nav
      ref={bar}
      aria-label="Club admin"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-[480px] grid-cols-5">
        {tabs.map((item) => {
          const on = isActive(item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={on ? "page" : undefined} aria-label={label(item)} className={tabClass(on)}>
                <span className={iconPill(on)}>
                  <Icon aria-hidden size={24} strokeWidth={on ? ICON_STROKE.active : ICON_STROKE.normal} />
                </span>
                <span className="max-w-full truncate px-0.5 max-[239px]:sr-only">{item.label}</span>
                {item.href === "/admin/messages" && unreadMessages > 0 ? (
                  <span aria-hidden className="absolute top-0 right-[calc(50%-24px)] grid h-5 min-w-5 place-items-center rounded-pill bg-kit-orange px-1 text-meta font-bold text-on-orange">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
        <li>
          <details ref={more} className="group/more">
            <summary className={`${tabClass(moreActive)} cursor-pointer list-none group-open/more:text-grass-text [&::-webkit-details-marker]:hidden`}>
              <span className={`${iconPill(moreActive)} group-open/more:bg-grass-tint`}>
                <MoreHorizontal aria-hidden size={24} strokeWidth={moreActive ? ICON_STROKE.active : ICON_STROKE.normal} />
              </span>
              <span className="max-w-full truncate px-0.5 max-[239px]:sr-only">More</span>
            </summary>
            {/* The scrim is behind the sheet; tapping it closes More (the pointerdown listener). */}
            <div aria-hidden className="fixed inset-0 -z-10 bg-pitch-deep/45" />
            <div className="fixed inset-x-0 bottom-[var(--staff-bar-height,72px)] max-h-[70dvh] overflow-y-auto rounded-t-[22px] bg-paper px-4 pt-2 pb-3 shadow-card">
              <ul className="mx-auto flex max-w-[480px] flex-col">
                {rest.map((item) => {
                  const on = isActive(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href} className="border-b border-line last:border-0">
                      <Link
                        href={item.href}
                        aria-current={on ? "page" : undefined}
                        className={`flex min-h-13 items-center gap-3 py-2 text-body font-bold ${on ? "text-grass-text" : "text-ink"}`}
                      >
                        <Icon aria-hidden size={24} className="shrink-0 text-grass-text" />
                        <span>{item.label}</span>
                        {"hint" in item ? <span className="ml-auto text-right text-small font-normal text-ink-muted">{item.hint}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        </li>
      </ul>
    </nav>
  );
}
