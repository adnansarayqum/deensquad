"use client";

import { useOptimistic, useTransition } from "react";
import { Check, X } from "lucide-react";
import type { Availability } from "@/lib/domain";
import { setAvailability } from "@/lib/parent/actions";

export function AvailabilityPicker({
  sessionId,
  playerId,
  answer,
  childName,
  question,
  compact = false,
  squad = false,
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
}) {
  const [optimistic, setOptimistic] = useOptimistic(answer);
  const [pending, startTransition] = useTransition();

  const choose = (value: Availability) =>
    startTransition(async () => {
      setOptimistic(value);
      await setAvailability(sessionId, playerId, value);
    });

  const base = `flex ${compact ? "min-h-[64px] flex-row gap-2 text-base" : "min-h-[100px] flex-col gap-1.5 text-[17px]"} flex-1 items-center justify-center rounded-app border-2 font-extrabold transition-transform active:translate-y-1 active:shadow-none`;
  const coming = optimistic === "coming";
  const away = optimistic === "away";
  const icon = compact ? 22 : 30;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={question} className="flex gap-3">
        <button
          type="button"
          aria-pressed={coming}
          onClick={() => choose("coming")}
          className={`${base} ${coming ? "border-grass bg-grass text-on-grass shadow-lip-grass" : "border-line bg-paper text-ink shadow-lip-neutral"}`}
        >
          <Check aria-hidden size={icon} strokeWidth={3} />
          {squad ? "Yes" : "Coming"}
        </button>
        <button
          type="button"
          aria-pressed={away}
          onClick={() => choose("away")}
          className={`${base} ${away ? "border-kit-orange bg-kit-orange text-on-orange shadow-[0_4px_0_#7a3310]" : "border-line bg-paper text-ink shadow-lip-neutral"}`}
        >
          <X aria-hidden size={icon} strokeWidth={3} />
          {squad ? "No" : "Not this week"}
        </button>
      </div>
      <p className="text-center text-sm text-ink-muted" aria-live="polite">
        {pending
          ? "Saving…"
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
    </div>
  );
}
