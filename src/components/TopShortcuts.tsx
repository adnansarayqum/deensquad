"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, QrCode } from "lucide-react";

const ROUND = "relative grid h-12 w-12 place-items-center rounded-pill bg-pitch-deep text-on-pitch";

/**
 * The shortcuts at the top right of every parent screen (the layout places them, so headers keep that corner free):
 * the attendance QR codes, ringed in gold on a session day, and Messages with the number of the club's messages
 * not read yet. Each says which screen it was opened from, so the back link and the tab bar return there.
 * A shortcut is left out on its own screen. /pass still works with no signal: the service worker answers it
 * with the codes saved on the phone.
 */
export function TopShortcuts({ unread, sessionToday, hasChildren }: { unread: number; sessionToday: boolean; hasChildren: boolean }) {
  const path = usePathname();
  const from = encodeURIComponent(path);
  const showPass = hasChildren && !path.startsWith("/pass");
  const showMessages = !path.startsWith("/messages");
  if (!showPass && !showMessages) return null;
  return (
    <div className="absolute top-[max(env(safe-area-inset-top),16px)] right-3 z-10 flex gap-2">
      {showPass ? (
        <Link
          href={`/pass?from=${from}`}
          aria-label={sessionToday ? "Attendance QR codes: session today" : "Attendance QR codes"}
          data-session-today={sessionToday ? "" : undefined}
          className={`${ROUND} ${sessionToday ? "ring-[3px] ring-floodlight" : "ring-2 ring-on-pitch/15"}`}
        >
          <QrCode aria-hidden size={22} />
        </Link>
      ) : null}
      {showMessages ? (
        <Link href={`/messages?from=${from}`} aria-label={unread > 0 ? `Messages, ${unread} new` : "Messages"} className={`${ROUND} ring-2 ring-on-pitch/15`}>
          <Mail aria-hidden size={22} />
          {unread > 0 ? (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-pill bg-kit-orange px-1 text-[11px] font-bold text-on-orange">
              {unread}
            </span>
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}
