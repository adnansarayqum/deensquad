"use client";

import { useTransition } from "react";
import { checkInPlayer } from "@/lib/actions";

export function CheckInButton({ playerId, name }: { playerId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => checkInPlayer(playerId))}
      aria-label={`Mark ${name} here`}
      className="min-h-10 rounded-xl border-2 border-line bg-paper px-3.5 text-sm font-extrabold text-grass-text shadow-[0_3px_0_var(--line)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-60"
    >
      {pending ? "Saving…" : "Mark here"}
    </button>
  );
}
