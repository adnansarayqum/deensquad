"use client";

import { useEffect, useRef } from "react";
import { Trophy } from "lucide-react";
import { useKeptActionState } from "@/components/submitKeepingInput";
import { makePlayerOfTheWeek, type SpotlightState } from "@/lib/spotlight/actions";

/** Make a child their group's Player of the week, with a line parents see on the card. */
export function SpotlightForm({ playerId, firstName, group, comment, max }: { playerId: string; firstName: string; group: string; /** This week's words, when this child already holds it. */ comment?: string; max: number }) {
  const [state, action, pending, keep] = useKeptActionState<SpotlightState>(makePlayerOfTheWeek, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.saved && !comment) form.current?.reset();
  }, [state, comment]);
  return (
    <form ref={form} action={action} onSubmit={keep} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="player" value={playerId} />
      <div>
        <label htmlFor="spotlight-comment" className="field-label">
          Why {firstName}? Parents see this on the card
        </label>
        <textarea id="spotlight-comment" name="comment" rows={3} maxLength={max} defaultValue={comment} className="field" placeholder="Worked hard all session and helped a new teammate settle in." />
        <p className="mt-1 text-[13px] text-ink-muted">First names only. Up to {max} characters.</p>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          Saved. {firstName}&apos;s parents are told, and get a card to share.
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass self-start" disabled={pending}>
        <Trophy aria-hidden size={18} />
        {pending ? "Saving…" : comment ? "Update the card" : `Make ${firstName} the ${group} Player of the week`}
      </button>
    </form>
  );
}
