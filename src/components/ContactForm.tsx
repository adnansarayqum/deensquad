"use client";

import { useActionState, useEffect, useRef } from "react";
import { addEmergencyContact, type ContactFormState } from "@/lib/parent/actions";
import { submitKeepingInput } from "@/components/submitKeepingInput";

type Kid = { id: string; firstName: string };

export function ContactForm({ child, siblings }: { child: Kid; siblings: Kid[] }) {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(addEmergencyContact, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.saved) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} onSubmit={submitKeepingInput(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="child" value={child.id} />
      <div>
        <label htmlFor="name" className="field-label">
          Name
        </label>
        <input id="name" name="name" autoComplete="off" required maxLength={80} className="field" />
      </div>
      <div>
        <label htmlFor="phone" className="field-label">
          Phone number
        </label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" required className="field" />
      </div>
      <div>
        <label htmlFor="relationship" className="field-label">
          Relationship to {child.firstName} <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input id="relationship" name="relationship" placeholder="Aunt, grandad, family friend" maxLength={40} className="field" />
      </div>
      {siblings.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label">Also add for</legend>
          {siblings.map((s) => (
            <label key={s.id} className="flex min-h-12 items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5">
              <input type="checkbox" name="child" value={s.id} defaultChecked className="h-5 w-5 accent-[var(--grass)]" />
              <span className="text-base font-bold">{s.firstName}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          Contact saved.
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Saving…" : "Save contact"}
      </button>
    </form>
  );
}
