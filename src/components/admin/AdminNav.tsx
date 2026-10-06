"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The admin sections: wrapping pills in the phone header, or a list down the desktop sidebar. */
export function AdminNav({ isAdmin, layout = "pills" }: { isAdmin: boolean; layout?: "pills" | "sidebar" }) {
  const path = usePathname();
  const items = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/families", label: "Families" },
    { href: "/admin/news", label: "News" },
    { href: "/admin/sessions", label: "Sessions" },
    { href: "/coach/plans", label: "Plans" },
    { href: "/coach/awards", label: "Points and stars" },
    ...(isAdmin ? [{ href: "/admin/shop", label: "Shop" }] : []),
    ...(isAdmin ? [{ href: "/admin/staff", label: "Staff" }] : []),
  ];
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  if (layout === "sidebar") {
    return (
      <nav aria-label="Club admin">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isActive(item.href);
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
    // Wraps onto a second line rather than scrolling sideways, so Plans and Points and stars are never off screen.
    <nav aria-label="Club admin" className="flex flex-wrap gap-1.5 pb-1">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-pill px-4 text-sm font-extrabold ${
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
