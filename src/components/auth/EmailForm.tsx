"use client";

import { useActionState } from "react";
import { requestCode, type FormState } from "@/lib/auth/actions";
import { FormError } from "./AuthShell";

export function EmailForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestCode, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="field-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="field"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : "email-hint"}
        />
        <p id="email-hint" className="mt-1.5 text-sm text-ink-muted">
          Use the email you gave the club. We&apos;ll send you a 6-digit code.
        </p>
      </div>
      {state.error ? <FormError id="email-error">{state.error}</FormError> : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Sending…" : "Email me a code"}
      </button>
    </form>
  );
}
