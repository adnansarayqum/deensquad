"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshIfReachable } from "@/lib/client/register-refresh";
import { tapRoute, TapProblem, type Problem } from "./TapProblem";

// Mark here and Undo on the register. A tap that doesn't save (no signal) leaves the register as it is and says so
// on that child's row, with Try again, so the coach doesn't have to find the child again. Each renders the button and,
// after a failed tap, a full-width note: put them in a wrapping flex row (`flex-wrap`).

const NOTE = "order-last basis-full";

export function CheckInButton({ sessionId, playerId, name, disabled = false }: { sessionId: string; playerId: string; name: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  // Saved: shown on the row straight away, whether or not the refresh that moves the child to Here can run yet.
  const [done, setDone] = useState(false);
  const router = useRouter();
  const mark = () =>
    startTransition(async () => {
      setProblem(null);
      const p = await tapRoute("/api/coach/register", { session: sessionId, child: playerId });
      setProblem(p);
      if (!p) {
        setDone(true);
        void refreshIfReachable(() => router.refresh());
      }
    });
  return (
    <>
      <button
        type="button"
        disabled={pending || disabled || done}
        onClick={mark}
        aria-label={done ? `${name} is marked here` : `Mark ${name} here`}
        className="min-h-12 shrink-0 rounded-xl border border-line bg-paper px-3.5 text-sm font-bold text-grass-text shadow-[0_3px_0_var(--line)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-60 disabled:shadow-none"
      >
        {pending ? "Saving…" : done ? "Here" : "Mark here"}
      </button>
      {problem ? <TapProblem problem={problem} onRetry={mark} retrying={pending} className={NOTE} /> : null}
    </>
  );
}

export function UndoCheckInButton({ sessionId, playerId, name, disabled = false }: { sessionId: string; playerId: string; name: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const undo = () =>
    startTransition(async () => {
      setProblem(null);
      const p = await tapRoute("/api/coach/register", { session: sessionId, child: playerId, undo: true });
      setProblem(p);
      if (!p) {
        setDone(true);
        void refreshIfReachable(() => router.refresh());
      }
    });
  return (
    <>
      <button
        type="button"
        disabled={pending || disabled || done}
        onClick={undo}
        aria-label={`Undo check-in for ${name}`}
        className="min-h-12 min-w-12 shrink-0 rounded-xl px-3 text-sm font-bold text-ink underline disabled:opacity-60"
      >
        {pending ? "…" : done ? "Undone" : "Undo"}
      </button>
      {problem ? <TapProblem problem={problem} onRetry={undo} retrying={pending} className={NOTE} /> : null}
    </>
  );
}
