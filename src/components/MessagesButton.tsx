"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail } from "lucide-react";

/**
 * Messages with the club, top right of every parent screen, with the number of the club's messages not read yet.
 * It sits over the screen's own header (the layout places it), so headers keep their top right corner free.
 * It says which screen it was opened from, so Messages' back link and the tab bar return there.
 */
export function MessagesButton({ unread }: { unread: number }) {
  const path = usePathname();
  if (path.startsWith("/messages")) return null;
  return (
    <Link
      href={`/messages?from=${encodeURIComponent(path)}`}
      aria-label={unread > 0 ? `Messages, ${unread} new` : "Messages"}
      className="absolute top-[max(env(safe-area-inset-top),16px)] right-3 z-10 grid h-12 w-12 place-items-center rounded-pill bg-pitch-deep text-on-pitch ring-2 ring-on-pitch/15"
    >
      <Mail aria-hidden size={22} />
      {unread > 0 ? (
        <span aria-hidden className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-pill bg-kit-orange px-1 text-[11px] font-bold text-on-orange">
          {unread}
        </span>
      ) : null}
    </Link>
  );
}
