"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, Copy } from "lucide-react";
import { makeCalendarLink } from "@/lib/calendar/actions";

/**
 * Player → Calendar. Plain forms posting a server action, so it works without JavaScript; the link comes back in
 * the action's result and is shown once (only its hash is stored). Copy link needs JavaScript; the link is also in a
 * read-only box to copy by hand.
 */
export function CalendarLink({ hasLink }: { hasLink: boolean }) {
  const [state, run, pending] = useActionState(makeCalendarLink, null);
  const links = state?.links;

  return (
    <div className="flex flex-col gap-4">
      {state?.error ? (
        <p role="alert" className="text-[15px] font-bold text-kit-orange">
          {state.error}
        </p>
      ) : null}

      {links ? (
        <section aria-labelledby="calendar-ready" className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
          <h2 id="calendar-ready" className="text-[17px] font-extrabold">
            Your calendar link
          </h2>
          <p role="status" className="text-[15px] leading-[22px]">
            Add it now: this is the only time the app shows it. Keep it to yourself, as anyone with it can see your children&apos;s sessions.
          </p>
          <a href={links.webcal} className="btn-chunky btn-grass inline-flex items-center justify-center gap-2">
            <CalendarPlus aria-hidden size={20} />
            Subscribe (iPhone, iPad, Mac)
          </a>
          <a href={links.google} target="_blank" rel="noopener" className="btn-chunky btn-paper inline-flex items-center justify-center">
            Google Calendar
          </a>
          <CopyLink href={links.https} />
        </section>
      ) : hasLink ? (
        <p className="text-[15px] leading-[22px]">Your calendar link is set up. Reset it to see it again.</p>
      ) : null}

      {links || hasLink ? (
        <form action={run} className="flex flex-col gap-2 rounded-app border-2 border-line bg-paper p-4">
          <h2 className="text-[17px] font-extrabold">Reset link</h2>
          <p className="text-[15px] leading-[22px]">Makes a new link. Anyone using the old link stops getting updates.</p>
          <button type="submit" disabled={pending} className="btn-chunky btn-paper self-start">
            Reset link
          </button>
        </form>
      ) : (
        <form action={run}>
          <button type="submit" disabled={pending} className="btn-chunky btn-grass w-full">
            Get my calendar link
          </button>
        </form>
      )}
    </div>
  );
}

function CopyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="calendar-url" className="text-[15px] font-bold">
        Link for other calendar apps
      </label>
      <input id="calendar-url" readOnly value={href} className="field min-h-12 font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={copy} className="btn-chunky btn-paper inline-flex items-center justify-center gap-2 self-start">
        <Copy aria-hidden size={18} />
        Copy link
      </button>
      <p aria-live="polite" className="text-[15px] text-ink-muted">
        {copied === "copied" ? "Copied." : copied === "failed" ? "Couldn't copy. Select the link above and copy it." : ""}
      </p>
    </div>
  );
}
