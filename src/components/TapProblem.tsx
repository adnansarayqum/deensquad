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
    // A request that never answers (a weak signal) says so after 10 s instead of "Saving…" for ever.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const gaveUp = new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), TAP_TIMEOUT_MS)));
    const answer = await Promise.race([run(), gaveUp]).finally(() => clearTimeout(timer));
    if (answer === "timeout") return { kind: "offline" };
    result = answer;
  } catch (error) {
    unstable_rethrow(error);
    return { kind: "offline" };
  }
  return result?.error ? { kind: "refused", message: result.error } : null;
}

export const TAP_TIMEOUT_MS = 10_000;

/**
 * A tap sent to a route (not a Server Action, which Next queues one at a time with no time limit, so one stuck tap
 * would hold up every other): JSON in, `{ error? }` out, given up after 10 s. Signed out comes back as a refusal.
 */
export async function tapRoute(url: string, body: unknown): Promise<Problem | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TAP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.signal });
    const answer = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (res.status === 401) return { kind: "refused", message: "You've been signed out. Reload and sign in again." };
    if (!res.ok && typeof answer.error !== "string") return { kind: "offline" };
    return typeof answer.error === "string" ? { kind: "refused", message: answer.error } : null;
  } catch {
    return { kind: "offline" };
  } finally {
    clearTimeout(timer);
  }
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
        {offline ? "That didn't save. Check your signal and try again." : problem.message}
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
