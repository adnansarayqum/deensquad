"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CalendarPlus, Check, ChevronDown, X } from "lucide-react";
import Link from "next/link";
import type { Availability } from "@/lib/domain";
import { track } from "@/lib/analytics";
import { setAvailability } from "@/lib/parent/actions";
import { tapAction, TapProblem, type Problem } from "./TapProblem";

export function AvailabilityPicker({
  sessionId,
  playerId,
  answer,
  childName,
  question,
  compact = false,
  squad = false,
  answered,
  calendar,
}: {
  sessionId: string;
  playerId: string;
  answer: Availability | undefined;
  childName: string;
  question: string;
  /** Shorter buttons when several children are listed on one screen. */
  compact?: boolean;
  /** A tournament squad invite: the same answers, worded as "can play" and "can't play". */
  squad?: boolean;
  /** Who gave the saved answer and when ("Coming · answered by Sara, Tue 2:02pm"), shown until this person taps. */
  answered?: string;
  /** "Add to calendar" links for this session, shown under a Coming (or "Yes, can play") answer. */
  calendar?: CalendarLinks;
}) {
  const [optimistic, setOptimistic] = useOptimistic(answer);
  // "Saved…" is only for the person who just tapped here; anyone else (another parent sharing the child, or this
  // parent on a later visit) sees who answered instead.
  const [tapped, setTapped] = useState(false);
  const [pending, startTransition] = useTransition();
  // A tap that didn't save, and the answer it was for (Try again sends it again). The buttons go back to the saved answer.
  const [failed, setFailed] = useState<{ problem: Problem; value: Availability } | null>(null);

  const choose = (value: Availability) =>
    startTransition(async () => {
      setFailed(null);
      setTapped(true);
      setOptimistic(value);
      const problem = await tapAction(() => setAvailability(sessionId, playerId, value));
      if (problem) return setFailed({ problem, value });
      track("availability_answered", { answer: value });
    });

  const base = `flex ${compact ? "min-h-[64px] flex-row gap-2 text-base" : "min-h-[100px] flex-col gap-1.5 text-[17px]"} min-w-0 flex-1 basis-32 items-center justify-center rounded-app border-2 px-2 text-center font-extrabold transition-transform active:translate-y-1 active:shadow-none`;
  const coming = optimistic === "coming";
  const away = optimistic === "away";
  const icon = compact ? 22 : 30;
  // Each button is named for the child, so a family with several children doesn't hear "Coming" again and again. The
  // visible word stays in the name (voice control users say what they see).
  const comingName = squad ? `Yes, ${childName} can play` : `${childName} is coming`;
  const awayName = squad ? `No, ${childName} can't play` : `Not this week: ${childName} isn't coming`;

  return (
    <div className="flex flex-col gap-3">
      {/* Side by side on a phone; one above the other when the screen is very narrow (200% zoom), never wider than it. */}
      <div role="group" aria-label={question} className="flex flex-wrap gap-3">
        <button
          type="button"
          aria-pressed={coming}
          aria-label={comingName}
          onClick={() => choose("coming")}
          className={`${base} ${coming ? "border-grass bg-grass text-on-grass shadow-lip-grass" : "border-line bg-paper text-ink shadow-lip-neutral"}`}
        >
          <Check aria-hidden size={icon} strokeWidth={3} />
          {squad ? "Yes" : "Coming"}
        </button>
        <button
          type="button"
          aria-pressed={away}
          aria-label={awayName}
          onClick={() => choose("away")}
          className={`${base} ${away ? "border-ink bg-cream text-ink shadow-lip-neutral" : "border-line bg-paper text-ink shadow-lip-neutral"}`}
        >
          <X aria-hidden size={icon} strokeWidth={3} />
          {squad ? "No" : "Not this week"}
        </button>
      </div>
      {failed && !pending ? (
        <TapProblem problem={failed.problem} onRetry={() => choose(failed.value)} />
      ) : (
      <p className="text-center text-sm text-ink-muted" aria-live="polite">
        {pending
          ? "Saving…"
          : !tapped && answered && optimistic
            ? answered
            : coming
            ? squad
              ? `Saved. The coach can see ${childName} can play.`
              : `Saved. Coach can see ${childName} is coming.`
            : away
              ? squad
                ? `Saved. The coach knows ${childName} can't play, so they can ask a reserve.`
                : `Saved. Coach knows ${childName} is away this week.`
              : `Tap once. ${childName}'s coach sees it straight away.`}
      </p>
      )}
      {coming && calendar && !failed ? <AddToCalendar links={calendar} /> : null}
    </div>
  );
}

/** `label` names the session for screen readers ("Training, Fri 9 Oct"), as several children can each have one. */
export type CalendarLinks = { google: string; ics: string; label: string };

/**
 * A small secondary "Add to calendar" under a Coming answer: Google Calendar (its own "create event" page, in a new
 * tab) or a one-event .ics file (Apple Calendar, Outlook and the rest), plus a line to the family's calendar feed.
 */
function AddToCalendar({ links }: { links: CalendarLinks }) {
  const item = "flex min-h-12 items-center rounded-[12px] px-3 text-[15px] font-bold text-grass-text underline";
  return (
    <div className="flex flex-col items-center">
      <details className="group w-full max-w-xs">
        <summary className="mx-auto flex min-h-12 w-fit cursor-pointer list-none items-center gap-2 rounded-pill px-3 text-[15px] font-bold text-ink [&::-webkit-details-marker]:hidden">
          <CalendarPlus aria-hidden size={18} />
          Add to calendar<span className="sr-only">: {links.label}</span>
          <ChevronDown aria-hidden size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-1 flex flex-col rounded-app border-2 border-line bg-paper p-1">
          <a href={links.google} target="_blank" rel="noopener" className={item} onClick={() => track("calendar_added", { kind: "google" })}>
            Google Calendar
          </a>
          <a href={links.ics} className={item} onClick={() => track("calendar_added", { kind: "ics" })}>
            Apple or other calendar (.ics)
          </a>
        </div>
      </details>
      <Link href="/player/calendar" className="inline-flex min-h-12 items-center text-sm text-ink-muted underline">
        Add every session automatically
      </Link>
    </div>
  );
}
