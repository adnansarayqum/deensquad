"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/families", label: "Families" },
    { href: "/admin/news", label: "News" },
    { href: "/admin/sessions", label: "Sessions" },
    { href: "/admin/shop", label: "Shop" },
    { href: "/coach/awards", label: "Points and stars" },
    ...(isAdmin ? [{ href: "/admin/staff", label: "Staff" }] : []),
  ];
  return (
    <nav aria-label="Club admin" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {items.map((item) => {
        const active = item.href === "/admin" ? path === "/admin" : path.startsWith(item.href);
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
