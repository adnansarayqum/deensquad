"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { CalendarDays, House, ListChecks, ShoppingBag, Users } from "lucide-react";
import { tabFor } from "@/lib/parent/tabs";

export function TabBar({ unread }: { unread: number }) {
  // Pages under a tab keep it lit (the QR code under Sessions, Messages under Family), and a page opened from
  // another tab says so with ?from= (medical needs from To-do), so the bar doesn't jump mid-task.
  const active = tabFor(useSelectedLayoutSegment(), useSearchParams().get("from"));
  // The bar grows with large text and zoom: tell the page its real height (--tab-bar-height, used by the parent
  // layout's bottom padding) so nothing at the bottom of a screen, like the QR code's tips, sits behind it.
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--tab-bar-height", `${Math.ceil(el.getBoundingClientRect().height)}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--tab-bar-height");
    };
  }, []);
  const tabs = [
    { segment: "news", label: "Home", icon: House },
    { segment: "friday", label: "Sessions", icon: CalendarDays },
    { segment: "checklist", label: "To-do", icon: ListChecks },
    { segment: "shop", label: "Shop", icon: ShoppingBag },
    { segment: "player", label: "Family", icon: Users },
  ] as const;
  return (
    <nav
      ref={bar}
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t border-line bg-paper px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),16px)]"
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ segment, label, icon: Icon }) => {
          const isActive = active === segment;
          return (
            <li key={segment}>
              <Link
                href={`/${segment}`}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex min-h-12 flex-col items-center gap-0.5 py-1 text-[13px] font-bold ${isActive ? "text-grass-text" : "text-ink-muted"}`}
              >
                {/* The tab you're on: its icon sits in a soft green pill, and the label turns green. */}
                <span className={`grid h-8 w-14 place-items-center rounded-pill transition-colors ${isActive ? "bg-grass-tint" : ""}`}>
                  <Icon aria-hidden size={22} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                {/* At very narrow widths (200% zoom on a phone) the labels would be cut off, so only the icons show; the label stays as the name. */}
                <span className="max-w-full truncate px-0.5 max-[239px]:sr-only">{label}</span>
                {segment === "news" && unread > 0 ? (
                  <span className="absolute top-0 right-[calc(50%-24px)] grid h-5 min-w-5 place-items-center rounded-pill bg-kit-orange px-1 text-[13px] font-bold text-on-orange">
                    {unread}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
