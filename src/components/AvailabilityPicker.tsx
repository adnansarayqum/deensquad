"use client";

import { useId, useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { CalendarPlus, Check, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import type { Availability } from "@/lib/domain";
import { track } from "@/lib/analytics";
import { saved } from "@/lib/feedback/feedback";
import { sendAwayReason, setAvailability, type AwayReasonState } from "@/lib/parent/actions";
import { useKeptActionState } from "./submitKeepingInput";
import { tapAction, TapProblem, type Problem } from "./TapProblem";

/** The longest reason (as AWAY_REASON_MAX on the server). */
const REASON_MAX = 200;

export function AvailabilityPicker({
  sessionId,
  playerId,
  answer,
  childName,
  question,
  compact = false,
  squad = false,
  answered,
  reason = null,
  calendar,
  quiet = false,
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
  /** The reason already sent for Not coming ("poorly"), shown under that answer with Change. */
  reason?: string | null;
  /** "Add to calendar" links for this session, shown under a Coming (or "Yes, can play") answer. */
  calendar?: CalendarLinks;
  /** No "Tap once…" hint before an answer (on News, where the card already asks the question). */
  quiet?: boolean;
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
      saved(value === "coming" ? (squad ? `Saved: ${childName} can play` : `Saved: ${childName} is coming`) : squad ? `Saved: ${childName} can't play` : `Saved: ${childName} isn't coming`);
    });

  const coming = optimistic === "coming";
  const away = optimistic === "away";
  // Each button is named for the child, so a family with several children doesn't hear "Coming" again and again. The
  // visible word stays in the name (voice control users say what they see).
  const comingName = squad ? `Yes, ${childName} can play` : `${childName} is coming`;
  const awayName = squad ? `No, ${childName} can't play` : `Not coming: ${childName} isn't coming`;

  // Several children on one screen: a segmented switch per child (one track, the chosen side lifted onto white), so
  // an answer reads as a setting, not as a big button still to press. One child: two large cards, as before.
  const seg = (on: boolean, tone: "grass" | "ink") =>
    `flex min-h-12 min-w-0 flex-1 basis-28 items-center justify-center gap-1.5 rounded-[11px] px-2 text-[15px] font-bold transition-[background-color,color,box-shadow] duration-200 ${
      on ? `bg-paper shadow-card ${tone === "grass" ? "text-grass-text" : "text-ink"}` : "text-ink-muted"
    }`;
  const card = (on: boolean, tone: "grass" | "ink") =>
    `flex min-h-[96px] min-w-0 flex-1 basis-32 flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] px-2 text-center text-[18px] font-bold transition-transform active:scale-[0.99] ${
      on ? (tone === "grass" ? "border-grass bg-grass-tint text-grass-text" : "border-ink bg-fill text-ink") : "border-line bg-paper text-ink"
    }`;
  const icon = compact ? 18 : 28;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Side by side on a phone; one above the other when the screen is very narrow (200% zoom), never wider than it. */}
      <div role="group" aria-label={question} className={compact ? "flex flex-wrap gap-1 rounded-[14px] bg-fill p-1" : "flex flex-wrap gap-3"}>
        <button
          type="button"
          aria-pressed={coming}
          aria-label={comingName}
          onClick={() => choose("coming")}
          className={compact ? seg(coming, "grass") : card(coming, "grass")}
        >
          <Check aria-hidden size={icon} strokeWidth={3} key={coming ? "on" : "off"} className={coming ? "animate-pop" : undefined} />
          {squad ? "Yes" : "Coming"}
        </button>
        <button
          type="button"
          aria-pressed={away}
          aria-label={awayName}
          onClick={() => choose("away")}
          className={compact ? seg(away, "ink") : card(away, "ink")}
        >
          <X aria-hidden size={icon} strokeWidth={3} key={away ? "on" : "off"} className={away ? "animate-pop" : undefined} />
          {squad ? "No" : "Not coming"}
        </button>
      </div>
      {/* After a tap on Home the "Saved" note above the tab bar says it, so the line below is for screen readers only there. */}
      {failed && !pending ? (
        <TapProblem problem={failed.problem} onRetry={() => choose(failed.value)} />
      ) : (
      <p className={`text-[14px] text-ink-muted empty:hidden ${compact ? "" : "text-center"} ${quiet && tapped && !pending ? "sr-only" : ""}`} aria-live="polite">
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
                : `Saved. Coach knows ${childName} isn't coming.`
              : quiet
                ? null
                : `Tap once. ${childName}'s coach sees it straight away.`}
      </p>
      )}
      {coming && calendar && !failed ? <AddToCalendar links={calendar} /> : null}
      {away && !pending && !failed ? <AwayReason sessionId={sessionId} playerId={playerId} childName={childName} saved={reason} /> : null}
    </div>
  );
}

/**
 * Under Not coming: an optional reason for the coaches ("poorly", "family wedding"). Sent as a message in the
 * thread for this session and child, so the coaches are told (and can reply), and shown on the register beside the
 * child. Once sent it shows what was sent, with Change. A plain form: it works before the page's script has loaded.
 */
function AwayReason({ sessionId, playerId, childName, saved }: { sessionId: string; playerId: string; childName: string; saved: string | null }) {
  const [state, run, sending, keep] = useKeptActionState<AwayReasonState>(sendAwayReason, {});
  const [editing, setEditing] = useState(false);
  const [sentAt, setSentAt] = useState<AwayReasonState | null>(null);
  const id = useId();
  // Show what was sent once the action answers (and leave the form when Change was tapped before).
  if (state.sent && state !== sentAt) {
    setSentAt(state);
    setEditing(false);
  }
  const sent = state.sent && state === sentAt ? state.sent : saved;
  const thread = state.conversation ? `/messages/${state.conversation}` : "/messages";

  if (sent && !editing) {
    return (
      <div className="flex flex-col gap-1 rounded-app bg-paper shadow-card px-3.5 py-3" role="status">
        <p className="flex items-start gap-2 text-[15px] leading-[22px]">
          <MessageSquare aria-hidden size={18} className="mt-0.5 shrink-0 text-ink-muted" />
          <span className="min-w-0 break-words">
            Sent to the coaches: <span className="font-bold">{sent}</span>
          </span>
        </p>
        <div className="flex flex-wrap gap-x-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Change the reason for ${childName}`}
            className="inline-flex min-h-12 items-center text-[15px] font-bold text-grass-text underline"
          >
            Change
          </button>
          <Link href={thread} className="inline-flex min-h-12 items-center text-[15px] font-bold text-grass-text underline">
            See in Messages
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={run} onSubmit={keep} className="flex flex-col gap-2 rounded-app bg-paper shadow-card px-3.5 py-3">
      <input type="hidden" name="session" value={sessionId} />
      <input type="hidden" name="child" value={playerId} />
      <label htmlFor={id} className="text-[15px] font-bold">
        Tell the coaches why? <span className="font-normal text-ink-muted">(optional)</span>
      </label>
      <input
        id={id}
        name="reason"
        type="text"
        maxLength={REASON_MAX}
        defaultValue={editing ? (saved ?? "") : ""}
        placeholder="For example: poorly, family wedding"
        autoComplete="off"
        className="field text-base"
      />
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3 py-2 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={sending} aria-label={`Send the reason for ${childName} to the coaches`} className="btn-chunky btn-paper btn-small min-h-12">
        {sending ? "Sending…" : "Send to the coaches"}
      </button>
    </form>
  );
}

/** `label` names the session for screen readers ("Training, Fri 9 Oct"), as several children can each have one. */
export type CalendarLinks = { google: string; ics: string; icsOpen: string; android: string; label: string };

type Platform = "android" | "apple" | "other";
const noSubscribe = () => () => {};
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "apple";
  return "other";
}

/**
 * One "Add to my calendar" button under a Coming answer that puts the session into the calendar already on the
 * phone: Android opens its own calendar app on a filled-in event (an intent; no website or sign-in), iPhone/iPad open
 * the event file, which Safari offers to add at once, and computers get the file (with Google Calendar on the web as
 * a second choice). Before the page knows the phone it links the file, which works everywhere.
 */
export function AddToCalendar({ links }: { links: CalendarLinks }) {
  // null while rendering on the server (and in the first paint), the phone's platform after that.
  const platform = useSyncExternalStore(noSubscribe, detectPlatform, () => null);
  const href = platform === "android" ? links.android : platform === "apple" ? links.icsOpen : links.ics;
  return (
    <div className="flex flex-col items-center gap-1">
      <a
        href={href}
        aria-label={`Add to my calendar: ${links.label}`}
        className="btn-chunky btn-paper btn-small inline-flex min-h-12 items-center gap-2"
        onClick={() => track("calendar_added", { kind: platform === "android" ? "android" : "ics" })}
      >
        <CalendarPlus aria-hidden size={18} />
        Add to my calendar
      </a>
      {platform === "other" ? (
        <a
          href={links.google}
          target="_blank"
          rel="noopener"
          aria-label={`Or use Google Calendar on the web: ${links.label}`}
          className="inline-flex min-h-12 items-center text-[15px] text-ink-muted underline"
          onClick={() => track("calendar_added", { kind: "google" })}
        >
          Or use Google Calendar on the web
        </a>
      ) : null}
      <Link href="/player/calendar?from=/friday" className="inline-flex min-h-12 items-center text-[15px] text-ink-muted underline">
        Add every session automatically
      </Link>
    </div>
  );
}
