"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { CalendarDays, ListChecks, Megaphone, User } from "lucide-react";

const tabs = [
  { segment: "news", label: "News", icon: Megaphone },
  { segment: "friday", label: "Friday", icon: CalendarDays },
  { segment: "checklist", label: "To-do", icon: ListChecks },
  { segment: "player", label: "Yusuf", icon: User },
] as const;

export function TabBar({ unread }: { unread: number }) {
  const active = useSelectedLayoutSegment();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t-2 border-line bg-paper px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom),16px)]"
    >
      <ul className="grid grid-cols-4 gap-1.5">
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
                {label}
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
