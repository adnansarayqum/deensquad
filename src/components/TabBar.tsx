"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { CalendarDays, ListChecks, Megaphone, ShoppingBag, User } from "lucide-react";

export function TabBar({ unread, playerLabel }: { unread: number; playerLabel: string }) {
  const active = useSelectedLayoutSegment();
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
    { segment: "news", label: "News", icon: Megaphone },
    { segment: "friday", label: "Friday", icon: CalendarDays },
    { segment: "checklist", label: "To-do", icon: ListChecks },
    { segment: "shop", label: "Shop", icon: ShoppingBag },
    { segment: "player", label: playerLabel, icon: User },
  ] as const;
  return (
    <nav
      ref={bar}
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t-2 border-line bg-paper px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom),16px)]"
    >
      <ul className="grid grid-cols-5 gap-1">
        {tabs.map(({ segment, label, icon: Icon }) => {
          const isActive = active === segment;
          return (
            <li key={segment}>
              <Link
                href={`/${segment}`}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 rounded-[14px] border-2 py-2 text-xs ${
                  isActive ? "border-grass bg-grass-tint font-extrabold text-grass-text" : "border-transparent font-bold text-ink-muted"
                }`}
              >
                <Icon aria-hidden size={24} strokeWidth={2} />
                <span className="max-w-full truncate px-0.5">{label}</span>
                {segment === "news" && unread > 0 ? (
                  <span className="absolute top-1 right-[calc(50%-22px)] grid h-5 min-w-5 place-items-center rounded-pill bg-kit-orange px-1 text-[11px] font-bold text-on-orange">
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
