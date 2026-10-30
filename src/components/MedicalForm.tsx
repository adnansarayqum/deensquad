"use client";

import { useEffect, useRef } from "react";
import { removeChildMedical, saveChildMedical, type MedicalFormState } from "@/lib/medical/actions";
import { MEDICAL_FIELD_MAX, type MedicalField, type MedicalText } from "@/lib/medical/data";
import { useKeptActionState } from "./submitKeepingInput";

// Player → a child's details → Medical and additional needs. Plain forms posting server actions (`action={run}`, so
// they work before the page has loaded); `submitKeepingInput` keeps what was typed when the action returns an error,
// and each form resets to its refreshed defaults after a save.

const FIELDS: { name: MedicalField; label: string; hint: (child: string) => string }[] = [
  { name: "conditions", label: "Conditions or needs (e.g. ADHD, autism, asthma)", hint: () => "Anything that affects how they play, learn or join in." },
  { name: "allergies", label: "Allergies", hint: () => "Foods, stings, medicines: and what happens." },
  { name: "medication", label: "Medication the coaches should know about", hint: (c) => `For example an inhaler ${c} brings to training.` },
  { name: "howToHelp", label: "How the coaches can help (e.g. give him a moment before instructions)", hint: () => "What works, and what to avoid." },
];

function Outcome({ state, pending, saved }: { state: MedicalFormState; pending: boolean; saved: string }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
        {state.error}
      </p>
    );
  }
  return state.saved && !pending ? (
    <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
      {saved}
    </p>
  ) : null;
}

export function MedicalForm({ child, medical }: { child: { id: string; firstName: string }; medical: MedicalText | null }) {
  const [state, run, pending, keep] = useKeptActionState<MedicalFormState>(saveChildMedical, {});
  const form = useRef<HTMLFormElement>(null);
  // A new state object each time the action returns, so every save resets to what was saved.
  useEffect(() => {
    if (state.saved) form.current?.reset();
  }, [state]);
  const name = child.firstName;
  return (
    <form ref={form} action={run} onSubmit={keep} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="child" value={child.id} />
      {FIELDS.map((f) => (
        <div key={f.name}>
          <label htmlFor={`medical-${f.name}`} className="field-label">
            {f.label}
          </label>
          <textarea
            id={`medical-${f.name}`}
            name={f.name}
            rows={3}
            maxLength={MEDICAL_FIELD_MAX}
            defaultValue={medical?.[f.name] ?? ""}
            aria-describedby={`medical-${f.name}-hint`}
            className="field min-h-24 py-3 leading-[22px]"
          />
          <p id={`medical-${f.name}-hint`} className="mt-1.5 text-sm text-ink-muted">
            {f.hint(name)}
          </p>
        </div>
      ))}
      <label className="flex items-start gap-3 rounded-app border-2 border-line bg-cream p-3.5 text-[15px] leading-[22px]">
        <input
          type="checkbox"
          name="consent"
          value="yes"
          // Never ticked for the parent: each save is a fresh, explicit agreement (recorded as consent_at).
          className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--grass)]"
        />
        <span>
          I agree to the club&apos;s coaches for {name}&apos;s group and the club&apos;s admins seeing this, to look after {name}. I can change or
          remove it at any time.
        </span>
      </label>
      <Outcome state={state} pending={pending} saved={state.saved === "removed" ? `${name}'s medical information is removed.` : `Saved. ${name}'s coaches can see it.`} />
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function RemoveMedicalForm({ child }: { child: { id: string; firstName: string } }) {
  const [state, run, pending, keep] = useKeptActionState<MedicalFormState>(removeChildMedical, {});
  const name = child.firstName;
  return (
    <form action={run} onSubmit={keep} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="child" value={child.id} />
      <label className="flex min-h-12 items-center gap-3 text-[15px] font-bold">
        <input type="checkbox" name="confirm" value="yes" className="h-6 w-6 shrink-0 accent-[var(--kit-orange)]" />
        Yes, remove all of {name}&apos;s medical information
      </label>
      <Outcome state={state} pending={pending} saved={`${name}'s medical information is removed.`} />
      <button type="submit" className="btn-chunky btn-paper" disabled={pending}>
        {pending ? "Removing…" : "Remove all medical information"}
      </button>
    </form>
  );
}
