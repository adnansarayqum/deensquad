"use client";

import { useState, useTransition } from "react";
import { checkInPlayer, undoCheckIn } from "@/lib/staff/actions";
import { tapAction, TapProblem, type Problem } from "./TapProblem";

// Mark here and Undo on the register. A tap that doesn't save (no signal) leaves the register as it is and says so
// on that child's row, with Try again, so the coach doesn't have to find the child again. Each renders the button and,
// after a failed tap, a full-width note: put them in a wrapping flex row (`flex-wrap`).

const NOTE = "order-last basis-full";

export function CheckInButton({ sessionId, playerId, name, disabled = false }: { sessionId: string; playerId: string; name: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const mark = () =>
    startTransition(async () => {
      setProblem(null);
      setProblem(await tapAction(() => checkInPlayer(sessionId, playerId)));
    });
  return (
    <>
      <button
        type="button"
        disabled={pending || disabled}
        onClick={mark}
        aria-label={`Mark ${name} here`}
        className="min-h-12 shrink-0 rounded-xl border-2 border-line bg-paper px-3.5 text-sm font-extrabold text-grass-text shadow-[0_3px_0_var(--line)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-60 disabled:shadow-none"
      >
        {pending ? "Saving…" : "Mark here"}
      </button>
      {problem ? <TapProblem problem={problem} onRetry={mark} retrying={pending} className={NOTE} /> : null}
    </>
  );
}

export function UndoCheckInButton({ sessionId, playerId, name }: { sessionId: string; playerId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const undo = () =>
    startTransition(async () => {
      setProblem(null);
      setProblem(await tapAction(() => undoCheckIn(sessionId, playerId)));
    });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={undo}
        aria-label={`Undo check-in for ${name}`}
        className="min-h-12 min-w-12 shrink-0 rounded-xl px-3 text-sm font-bold text-ink underline disabled:opacity-60"
      >
        {pending ? "…" : "Undo"}
      </button>
      {problem ? <TapProblem problem={problem} onRetry={undo} retrying={pending} className={NOTE} /> : null}
    </>
  );
}
