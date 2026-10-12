"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { submitKeepingInput } from "@/components/submitKeepingInput";
import type { MessageFormState } from "@/lib/messages/actions";
import { BODY_MAX } from "@/lib/messages/limits";

/**
 * Write a message: a reply in a conversation, or the first message of a new one (with `children` for the child
 * picker and subject). A plain form posting a server action, so it works before the page's script has loaded;
 * `submitKeepingInput` keeps what was typed when the action refuses, and a sent reply clears the box.
 */
export function MessageForm({
  action,
  hidden,
  label = "Your message",
  submitLabel = "Send",
  placeholder,
  children,
}: {
  action: (prev: MessageFormState, formData: FormData) => Promise<MessageFormState>;
  hidden: Record<string, string>;
  label?: string;
  submitLabel?: string;
  placeholder?: string;
  children?: ReactNode;
}) {
  const [state, run, pending] = useActionState<MessageFormState, FormData>(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.saved) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={run} onSubmit={submitKeepingInput(run)} className="flex flex-col gap-3" noValidate>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div>
        <label htmlFor="message-body" className="field-label">
          {label}
        </label>
        <textarea id="message-body" name="body" rows={4} maxLength={BODY_MAX} className="field" placeholder={placeholder} />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          Sent.
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass self-start" disabled={pending}>
        {pending ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
