"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

type State = { error?: string; saved?: boolean };

/** A form whose Server Action returns { error } or { saved }; shows either message under the fields. */
export function StatefulForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  savedMessage = "Saved.",
  resetOnSave = false,
  className = "",
  children,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  submitLabel: string;
  pendingLabel?: string;
  savedMessage?: string;
  resetOnSave?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [state, run, pending] = useActionState<State, FormData>(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.saved && resetOnSave) form.current?.reset();
  }, [state, resetOnSave]);

  return (
    <form ref={form} action={run} className={`flex flex-col gap-4 ${className}`} noValidate>
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
