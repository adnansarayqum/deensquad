"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PoundSterling } from "lucide-react";
import { refreshIfReachable } from "@/lib/client/register-refresh";
import { tapRoute, TapProblem, type Problem } from "./TapProblem";

// "Paid £7" for a child who pays at the gate (pay as you go, or no plan yet), or a trial child: one tap once the card
// machine says approved. Then a grass "Paid £7" with Undo for a tap by mistake. Like Mark here, a tap that doesn't
// save says so on the row with Try again. Put it in a wrapping flex row (the note takes the full width).

const NOTE = "order-last basis-full";

export function GatePayButton({
  sessionId,
  id,
  kind = "child",
  name,
  fee,
  paid,
  disabled = false,
}: {
  sessionId: string;
  id: string;
  kind?: "child" | "trial";
  name: string;
  /** "£7": today's fee. */
  fee: string;
  /** What was taken ("£7"), once it has been. */
  paid: string | null;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const router = useRouter();
  // What the coach just saved, shown at once; the register's refresh (when it can run) brings the rest up to date.
  const [shownPaid, setShownPaid] = useState<string | null>(paid);
  // A refresh that brings a newer answer (another coach's tap) wins over the one shown.
  const [lastPaid, setLastPaid] = useState(paid);
  if (paid !== lastPaid) {
    setLastPaid(paid);
    setShownPaid(paid);
  }
  const run = (undo: boolean) =>
    startTransition(async () => {
      setProblem(null);
      // A route for a child and a trial alike, so one tap stuck on a weak signal never holds up the others.
      const p = await tapRoute("/api/coach/payment", { session: sessionId, ...(kind === "trial" ? { trial: id } : { child: id }), undo });
      setProblem(p);
      if (!p) {
        setShownPaid(undo ? null : fee);
        void refreshIfReachable(() => router.refresh());
      }
    });

  if (shownPaid) {
    const paid = shownPaid;
    // A small line under the child's name (not beside the check-in's Undo, so the two Undos are never side by side).
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 rounded-pill bg-grass px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap text-on-grass">
          <PoundSterling aria-hidden size={12} strokeWidth={3} />
          Paid {paid}
        </span>
        <button
          type="button"
          disabled={pending || disabled}
          onClick={() => run(true)}
          aria-label={`Undo payment for ${name}`}
          // Small on the row; the tap area reaches 48px tall around it, so the row keeps its height.
          className="relative text-[13px] font-bold text-ink-muted underline after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[''] disabled:opacity-60"
        >
          {pending ? "Undoing…" : "Undo payment"}
        </button>
        {problem ? <TapProblem problem={problem} onRetry={() => run(true)} retrying={pending} className={NOTE} /> : null}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() => run(false)}
        aria-label={`${name} paid ${fee}`}
        className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-xl border border-line bg-paper px-3 text-sm font-bold text-ink shadow-[0_3px_0_var(--line)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-60 disabled:shadow-none"
      >
        <PoundSterling aria-hidden size={14} strokeWidth={3} />
        {pending ? "Saving…" : `Paid ${fee}`}
      </button>
      {problem ? <TapProblem problem={problem} onRetry={() => run(false)} retrying={pending} className={NOTE} /> : null}
    </>
  );
}
