"use client";

import type { ReactNode } from "react";

/**
 * A sponsor's website or social link. It is the sponsor's own address and opens outside the app; on a tap the app
 * also adds one to that sponsor's total of link taps (a count only), without holding the tap up. A middle click opens
 * the link too, so it counts; a right click only opens the menu, so it doesn't.
 */
export function SponsorLink({ id, href, label, className, children }: { id: string; href: string; label: string; className: string; children: ReactNode }) {
  const count = () => {
    try {
      const body = new Blob([JSON.stringify({ id })], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/sponsor-click", body)) void fetch("/api/sponsor-click", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch {
      // A count is never worth breaking the link for.
    }
  };
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={className} onClick={count} onAuxClick={(e) => (e.button === 1 ? count() : undefined)}>
      {children}
    </a>
  );
}
