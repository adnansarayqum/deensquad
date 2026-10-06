"use client";

import { unstable_rethrow } from "next/navigation";
import { CircleAlert, WifiOff } from "lucide-react";

/**
 * Why a tap didn't save: the request never came back (no signal, a timeout or a server fault), or the action
 * answered with a reason it can't be done (`refused`).
 */
export type Problem = { kind: "offline" } | { kind: "refused"; message: string };

/** The answer from a Server Action that can refuse: nothing, or a message to show beside the tap. */
export type Refusal = { error?: string } | void;

/**
 * Runs a Server Action from a tap and says what went wrong instead of throwing, so the screen stays as it is
 * (a thrown action would replace the whole page with the error screen). Next's own redirects still go through.
 */
export async function tapAction(run: () => Promise<Refusal>): Promise<Problem | null> {
  let result: Refusal;
  try {
    result = await run();
  } catch (error) {
    unstable_rethrow(error);
    return { kind: "offline" };
  }
  return result?.error ? { kind: "refused", message: result.error } : null;
}

/**
 * A small inline note beside the tap that didn't save, in the signal colour with words, and Try again when
 * it was the signal. `className` places it in its row (e.g. `basis-full` in a wrapping flex row).
 */
export function TapProblem({ problem, onRetry, retrying = false, className = "" }: { problem: Problem; onRetry?: () => void; retrying?: boolean; className?: string }) {
  const offline = problem.kind === "offline";
  const Icon = offline ? WifiOff : CircleAlert;
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-kit-orange bg-orange-tint px-3 py-2 text-ink ${className}`}>
      <p className="flex min-w-[14ch] flex-1 items-center gap-2 text-sm leading-5 font-bold">
        <Icon aria-hidden size={18} className="shrink-0 text-kit-orange" />
        {offline ? "No signal. That didn't save." : problem.message}
      </p>
      {offline && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="min-h-12 shrink-0 rounded-xl border-2 border-line bg-paper px-3.5 text-sm font-extrabold text-ink shadow-[0_3px_0_var(--line)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-60"
        >
          {retrying ? "Saving…" : "Try again"}
        </button>
      ) : null}
    </div>
  );
}
