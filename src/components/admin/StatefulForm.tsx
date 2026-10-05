"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { submitKeepingInput } from "@/components/submitKeepingInput";

type State = { error?: string; saved?: boolean };
const INITIAL: State = {};

/**
 * A form whose Server Action returns { error } or { saved }; shows either message under the fields.
 * Typed input stays after an error; after any other result the form resets (to the saved values on edit forms).
 */
export function StatefulForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  savedMessage = "Saved.",
  className = "",
  children,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  submitLabel: string;
  pendingLabel?: string;
  savedMessage?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, run, pending] = useActionState<State, FormData>(action, INITIAL);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state !== INITIAL && !state.error) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={run} onSubmit={submitKeepingInput(run)} className={`flex flex-col gap-4 ${className}`} noValidate>
      {children}
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {savedMessage}
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass self-start" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
