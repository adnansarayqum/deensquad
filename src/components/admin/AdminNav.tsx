"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Every staff page, in the order the club works through them. Coaches don't see the admin-only ones. */
export const STAFF_NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/coach", label: "Register", exact: true },
  { href: "/admin/families", label: "Families" },
  { href: "/admin/news", label: "News" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/coach/plans", label: "Plans" },
  { href: "/coach/practice", label: "Practice sheets" },
  { href: "/coach/awards", label: "Points and stars" },
  { href: "/admin/shop", label: "Shop", adminOnly: true },
  { href: "/admin/staff", label: "Staff", adminOnly: true },
] as const;

/** The staff sections: wrapping pills in the phone header, or a list down the desktop sidebar. */
export function AdminNav({ isAdmin, layout = "pills" }: { isAdmin: boolean; layout?: "pills" | "sidebar" }) {
  const path = usePathname();
  const items = STAFF_NAV.filter((item) => isAdmin || !("adminOnly" in item && item.adminOnly));
  const isActive = (item: (typeof STAFF_NAV)[number]) => ("exact" in item && item.exact ? path === item.href : path.startsWith(item.href));

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
                  className={`flex min-h-12 items-center rounded-dash px-3 text-[15px] font-extrabold ${
                    active ? "bg-floodlight text-on-gold" : "text-on-pitch hover:bg-pitch-deep"
                  }`}
                >
                  {item.label}
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
            className={`inline-flex min-h-11 shrink-0 items-center rounded-pill px-3.5 text-sm font-extrabold ${
              active ? "bg-floodlight text-on-gold" : "bg-pitch-deep text-on-pitch"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
