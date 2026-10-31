"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, QrCode } from "lucide-react";

const ROUND = "relative grid h-12 w-12 place-items-center rounded-pill bg-pitch-deep text-on-pitch";
/** Each shortcut is the round button with its name under it in words ("QR codes", "Messages"): icons alone left
 * parents guessing (UX review, Oct 2026). The whole column is the link, so the tap area is larger than the circle. */
const ITEM = "flex w-[66px] flex-col items-center gap-0.5 text-on-pitch max-[374px]:w-12";
// On the narrowest phones (and at large zoom) the words would run into the screen titles, so the buttons stand alone there.
const LABEL = "text-[13px] leading-4 font-bold whitespace-nowrap max-[374px]:hidden";

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
    <div className="absolute top-[max(env(safe-area-inset-top),12px)] right-2 z-10 flex gap-1 max-[374px]:right-3 max-[374px]:gap-2">
      {showPass ? (
        <Link
          href={`/pass?from=${from}`}
          aria-label={sessionToday ? "Attendance QR codes: session today" : "Attendance QR codes"}
          data-session-today={sessionToday ? "" : undefined}
          className={ITEM}
        >
          <span className={`${ROUND} ${sessionToday ? "ring-[3px] ring-floodlight" : "ring-2 ring-on-pitch/15"}`}>
            <QrCode aria-hidden size={22} />
          </span>
          <span aria-hidden className={LABEL}>
            QR codes
          </span>
        </Link>
      ) : null}
      {showMessages ? (
        <Link href={`/messages?from=${from}`} aria-label={unread > 0 ? `Messages, ${unread} new` : "Messages"} className={ITEM}>
          <span className={`${ROUND} ring-2 ring-on-pitch/15`}>
            <Mail aria-hidden size={22} />
            {unread > 0 ? (
              <span aria-hidden className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-pill bg-kit-orange px-1 text-[13px] font-bold text-on-orange">
                {unread}
              </span>
            ) : null}
          </span>
          <span aria-hidden className={LABEL}>
            Messages
          </span>
        </Link>
      ) : null}
    </div>
  );
}
