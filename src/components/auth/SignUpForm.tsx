"use client";

import { useActionState, useState } from "react";
import { register, type FormState } from "@/lib/auth/actions";
import { FormError } from "./AuthShell";
import { submitKeepingInput } from "@/components/submitKeepingInput";

type Group = { value: string; label: string };

export function SignUpForm({ groups, maxChildren }: { groups: Group[]; maxChildren: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(register, {});
  const [children, setChildren] = useState(1);

  return (
    <form action={action} onSubmit={submitKeepingInput(action)} className="flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[19px] font-extrabold">About you</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="field-label">
              First name
            </label>
            <input id="firstName" name="firstName" autoComplete="given-name" maxLength={40} required className="field" />
          </div>
          <div>
            <label htmlFor="lastName" className="field-label">
              Last name
            </label>
            <input id="lastName" name="lastName" autoComplete="family-name" maxLength={40} required className="field" />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="field-label">
            Email address
          </label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required className="field" />
          <p className="mt-1.5 text-sm text-ink-muted">We&apos;ll send a 6-digit code here to check it&apos;s yours.</p>
        </div>
        <div>
          <label htmlFor="phone" className="field-label">
            Mobile number
          </label>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="field" />
        </div>
      </fieldset>

      {Array.from({ length: children }, (_, i) => (
        <fieldset key={i} className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
          <legend className="px-1 text-[19px] font-extrabold">{children === 1 ? "Your child" : `Child ${i + 1}`}</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`childFirstName-${i}`} className="field-label">
                First name
              </label>
              <input id={`childFirstName-${i}`} name="childFirstName" autoComplete="off" maxLength={40} className="field" />
            </div>
            <div>
              <label htmlFor={`childLastName-${i}`} className="field-label">
                Last name
              </label>
              <input id={`childLastName-${i}`} name="childLastName" autoComplete="off" maxLength={40} className="field" />
            </div>
          </div>
          <div>
            <label htmlFor={`childDob-${i}`} className="field-label">
              Date of birth
            </label>
            <input id={`childDob-${i}`} name="childDob" type="date" className="field" />
          </div>
          <div>
            <label htmlFor={`childGroup-${i}`} className="field-label">
              Group
            </label>
            <select id={`childGroup-${i}`} name="childGroup" defaultValue="" className="field">
              <option value="" disabled>
                Choose a group
              </option>
              {groups.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      ))}

      {children < maxChildren ? (
        <button type="button" className="btn-chunky btn-paper" onClick={() => setChildren((n) => n + 1)}>
          Add another child
        </button>
      ) : null}

      {state.error ? <FormError id="sign-up-error">{state.error}</FormError> : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Sending…" : "Sign up"}
      </button>
    </form>
  );
}
