"use client";

import { useActionState, useEffect, useRef } from "react";
import { Star } from "lucide-react";
import { giveAward, writeCoachNote, type AwardState } from "@/lib/awards/actions";

const POINTS = [1, 2, 5, 10];

function Messages({ state, pending, saved }: { state: AwardState; pending: boolean; saved: string }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {saved}
        </p>
      ) : null}
    </>
  );
}

export function AwardForm({ playerId, firstName }: { playerId: string; firstName: string }) {
  const [state, action, pending] = useActionState<AwardState, FormData>(giveAward, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.saved) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="player" value={playerId} />
      <h2 className="text-[17px] font-extrabold">Give {firstName} points or a star</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="field-label">Points</legend>
        <div className="flex flex-wrap gap-2">
          <label className="choice-chip">
            <input type="radio" name="points" value="0" defaultChecked className="sr-only" />
            None
          </label>
          {POINTS.map((p) => (
            <label key={p} className="choice-chip">
              <input type="radio" name="points" value={p} className="sr-only" />+{p}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-12 items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 has-[:checked]:border-crest-gold has-[:checked]:bg-gold-tint">
        <input type="checkbox" name="star" className="h-5 w-5 accent-[var(--crest-gold)]" />
        <Star aria-hidden size={20} className="text-gold-text" fill="currentColor" strokeWidth={0} />
        <span className="text-base font-bold">Star player</span>
      </label>
      <div>
        <label htmlFor="reason" className="field-label">
          What for? <span className="font-normal text-ink-muted">(optional, parents see this)</span>
        </label>
        <input id="reason" name="reason" maxLength={200} placeholder="Great teamwork, good adab" className="field" />
      </div>
      <Messages state={state} pending={pending} saved={`Given. ${firstName}'s parents can see it in the app.`} />
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Saving…" : "Give award"}
      </button>
    </form>
  );
}

export function NoteForm({ playerId, firstName }: { playerId: string; firstName: string }) {
  const [state, action, pending] = useActionState<AwardState, FormData>(writeCoachNote, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.saved) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="player" value={playerId} />
      <label htmlFor="note" className="text-[17px] font-extrabold">
        Note for {firstName}&apos;s parents
      </label>
      <textarea id="note" name="note" rows={3} maxLength={500} placeholder="What went well and what to work on" className="field" />
      <Messages state={state} pending={pending} saved="Note saved. It shows on their player page." />
      <button type="submit" className="btn-chunky btn-paper" disabled={pending}>
        {pending ? "Saving…" : "Save note"}
      </button>
    </form>
  );
}
