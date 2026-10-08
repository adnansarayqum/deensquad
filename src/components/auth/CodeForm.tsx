"use client";

import { useActionState } from "react";
import { submitKeepingInput } from "@/components/submitKeepingInput";
import { submitCode, type FormState } from "@/lib/auth/actions";
import { FormError } from "./AuthShell";

export function CodeForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(submitCode, {});
  return (
    <form action={action} onSubmit={submitKeepingInput(action)} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="code" className="field-label">
          6-digit code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          className="field text-center font-display !text-[34px] tracking-[0.3em] tabular-nums"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "code-error" : undefined}
        />
      </div>
      {state.error ? <FormError id="code-error">{state.error}</FormError> : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
