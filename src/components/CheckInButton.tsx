"use client";

import { useTransition } from "react";
import { checkInPlayer, undoCheckIn } from "@/lib/staff/actions";

export function CheckInButton({ sessionId, playerId, name }: { sessionId: string; playerId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => checkInPlayer(sessionId, playerId))}
      aria-label={`Mark ${name} here`}
      className="min-h-12 shrink-0 rounded-xl border-2 border-line bg-paper px-3.5 text-sm font-extrabold text-grass-text shadow-[0_3px_0_var(--line)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-60"
    >
      {pending ? "Saving…" : "Mark here"}
    </button>
  );
}

export function UndoCheckInButton({ sessionId, playerId, name }: { sessionId: string; playerId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => undoCheckIn(sessionId, playerId))}
      aria-label={`Undo check-in for ${name}`}
      className="min-h-12 min-w-12 shrink-0 rounded-xl px-3 text-sm font-bold text-ink underline disabled:opacity-60"
    >
      {pending ? "…" : "Undo"}
    </button>
  );
}
