"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Every staff page, in the order the club works through them. Coaches don't see the admin-only ones. */
export const STAFF_NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/coach", label: "Register", exact: true },
  { href: "/admin/families", label: "Families" },
  { href: "/admin/news", label: "News" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/coach/plans", label: "Plans" },
  // Shop sits here rather than after Points and stars so an admin's eleven pills (Messages with its count) still pack
  // into three rows at 390px, which the register's first-screen rule depends on.
  { href: "/admin/shop", label: "Shop", adminOnly: true },
  { href: "/coach/practice", label: "Practice sheets" },
  // Ratings (/coach/ratings) are reached from Points and stars, so it stays lit there.
  { href: "/coach/awards", label: "Points and stars", also: "/coach/ratings" },
  { href: "/admin/staff", label: "Staff", adminOnly: true },
] as const;

/** The staff sections: wrapping pills in the phone header, or a list down the desktop sidebar. */
export function AdminNav({ isAdmin, layout = "pills", unreadMessages = 0 }: { isAdmin: boolean; layout?: "pills" | "sidebar"; unreadMessages?: number }) {
  const path = usePathname();
  const items = STAFF_NAV.filter((item) => isAdmin || !("adminOnly" in item && item.adminOnly));
  const isActive = (item: (typeof STAFF_NAV)[number]) => ("exact" in item && item.exact ? path === item.href : path.startsWith(item.href) || ("also" in item && path.startsWith(item.also)));
  // Messages carries how many conversations have a parent's message this person hasn't read. The link is named
  // "Messages, 3 unread" (an aria-label, so it reads the same everywhere); the badge shows the number.
  const unread = (item: (typeof STAFF_NAV)[number]) => item.href === "/admin/messages" && unreadMessages > 0;
  const label = (item: (typeof STAFF_NAV)[number]) => (unread(item) ? `${item.label}, ${unreadMessages} unread` : undefined);
  const badge = (item: (typeof STAFF_NAV)[number]) =>
    unread(item) ? (
      <span aria-hidden className="ml-1.5 inline-grid h-6 min-w-6 place-items-center rounded-pill bg-kit-orange px-1.5 text-xs font-bold text-on-orange">
        {unreadMessages}
      </span>
    ) : null;

  if (layout === "sidebar") {
    return (
      <nav aria-label="Club admin">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label(item)}
                  className={`flex min-h-12 items-center rounded-dash px-3 text-[15px] font-bold ${
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

  return (
    // Wraps onto further lines rather than scrolling sideways, so Plans and Points and stars are never off screen.
    <nav aria-label="Club admin" className="flex flex-wrap gap-1.5 pb-1">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={label(item)}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-pill px-3 text-sm font-bold ${
              active ? "bg-floodlight text-on-gold" : "bg-pitch-deep text-on-pitch"
            }`}
          >
            {item.label}
            {badge(item)}
          </Link>
        );
      })}
    </nav>
  );
}
