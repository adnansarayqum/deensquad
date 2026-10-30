"use client";

import { startTransition, useActionState, useState, useTransition, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";

/**
 * onSubmit for a form whose action is a useActionState dispatch. React 19 clears an uncontrolled form
 * after its action finishes, even when the action returned an error, so a parent who mistyped one field
 * would lose everything. This sends the same FormData without that automatic reset; each form clears
 * itself on success. Keep `action={run}` on the form too, so a submit before hydration still works.
 */
export function submitKeepingInput(run: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = submitter?.getAttribute("name") ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
    startTransition(() => run(formData));
  };
}

/** What a form says when its request never came back (no signal, a timeout, a server fault). */
export const NOT_SENT = "That didn't send. Check your signal and try again. What you typed is still here.";

/**
 * `useActionState` for a form people type into, with the submit handler that keeps their text if the request fails.
 * Without JavaScript the form posts `run` as before. With it, `keep` (the form's onSubmit) calls the action itself, so
 * a failed request (weak signal) shows NOT_SENT in the form's own error line instead of replacing the page with the
 * error screen and losing what was typed. Next's redirects still go through.
 */
export function useKeptActionState<S extends { error?: string }>(action: (state: S, formData: FormData) => Promise<S>, initial: S) {
  const [serverState, run, serverPending] = useActionState<S, FormData>(action, initial as Awaited<S>);
  const [caught, setCaught] = useState<S | null>(null);
  const [caughtPending, start] = useTransition();
  const state = caught ?? serverState;
  const keep = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = submitter?.getAttribute("name") ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
    start(async () => {
      try {
        setCaught(await action(state, formData));
      } catch (error) {
        unstable_rethrow(error);
        setCaught({ ...state, error: NOT_SENT });
      }
    });
  };
  return [state, run, serverPending || caughtPending, keep] as const;
}
