"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { NOT_SENT } from "@/components/submitKeepingInput";
import { fileTooBig, oversizeFile } from "@/lib/files";

type State = { error?: string; saved?: boolean; message?: string };
const INITIAL: State = {};

/**
 * A form whose Server Action returns { error } or { saved }; shows either message under the fields
 * (the action's own `message` in place of `savedMessage` when it sends one).
 * Typed input stays after an error; after any other result the form resets (to the saved values on edit forms).
 *
 * With JavaScript every submit calls the action here, so a save that fails (no answer on a weak signal, or a body over
 * the Server Action limit) keeps what was typed and shows `keepOnFailure` (default NOT_SENT) instead of the error
 * page; a file over 8 MB is refused before anything is sent, naming its size. Next's redirects still go through.
 * Without JavaScript the form posts `run` as before.
 */
export function StatefulForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  savedMessage = "Saved.",
  keepOnFailure = NOT_SENT,
  className = "",
  children,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  submitLabel: string;
  pendingLabel?: string;
  savedMessage?: string;
  keepOnFailure?: string;
  className?: string;
  children: ReactNode;
}) {
  const [serverState, run, serverPending] = useActionState<State, FormData>(action, INITIAL);
  // With JavaScript a submit calls the action here instead, so a failure can be caught.
  // `action={run}` stays on the form for a submit before the page has loaded.
  const [caught, setCaught] = useState<State | null>(null);
  const [caughtPending, startCaught] = useTransition();
  const state = caught ?? serverState;
  const pending = serverPending || caughtPending;
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state !== INITIAL && !state.error) form.current?.reset();
  }, [state]);

  const submitCatching = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = submitter?.getAttribute("name") ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
    const big = oversizeFile(formData);
    if (big) return setCaught({ error: fileTooBig(big.size) });
    startCaught(async () => {
      try {
        setCaught(await action(state, formData));
      } catch (error) {
        unstable_rethrow(error);
        setCaught({ error: keepOnFailure });
      }
    });
  };

  return (
    <form ref={form} action={run} onSubmit={submitCatching} className={`flex flex-col gap-4 ${className}`} noValidate>
      {children}
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {state.message ?? savedMessage}
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass self-start" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
