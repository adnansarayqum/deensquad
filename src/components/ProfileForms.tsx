"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { addChild, saveMyChild, saveMyDetails, type ProfileFormState } from "@/lib/parent/actions";
import { submitKeepingInput } from "@/components/submitKeepingInput";

// Player → Your details, a child's details and Add a child. Each is a plain form posting a server action
// (`action={run}` keeps it working before hydration); `submitKeepingInput` keeps what was typed when the action
// returns an error. After a save the form is reset to its (refreshed) defaults, so the field shows the value as
// saved: a mobile typed as "+44 7700 900888" reads "07700 900888", as the club sees it.

type Group = { value: string; label: string };

function Field({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  autoComplete = "off",
  inputMode,
  hint,
  max,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "tel";
  hint?: string;
  max?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} name={name} type={type} defaultValue={defaultValue} autoComplete={autoComplete} inputMode={inputMode} max={max} className="field" />
      {hint ? <p className="mt-1.5 text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Outcome({ state, pending, saved }: { state: ProfileFormState; pending: boolean; saved: string }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {saved}
        </p>
      ) : null}
    </>
  );
}

function Form({ run, state, children, className = "" }: { run: (formData: FormData) => void; state?: ProfileFormState; children: ReactNode; className?: string }) {
  const form = useRef<HTMLFormElement>(null);
  // A new state object each time the action returns, so every save resets, not only the first.
  useEffect(() => {
    if (state?.saved) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={run} onSubmit={submitKeepingInput(run)} className={`flex flex-col gap-4 ${className}`} noValidate>
      {children}
    </form>
  );
}

export function MyDetailsForm({ details }: { details: { firstName: string; lastName: string; phone: string | null } }) {
  const [state, run, pending] = useActionState<ProfileFormState, FormData>(saveMyDetails, {});
  return (
    <Form run={run} state={state}>
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" name="firstName" label="First name" defaultValue={details.firstName} autoComplete="given-name" />
        <Field id="lastName" name="lastName" label="Last name" defaultValue={details.lastName} autoComplete="family-name" />
      </div>
      <Field
        id="phone"
        name="phone"
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={details.phone ?? ""}
        hint="The club uses it to reach you about sessions and your child."
      />
      <Outcome state={state} pending={pending} saved="Your details are saved." />
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Saving…" : "Save my details"}
      </button>
    </Form>
  );
}

export function ChildDetailsForm({ child, today }: { child: { id: string; firstName: string; lastName: string; dateOfBirth: string | null }; today: string }) {
  const [state, run, pending] = useActionState<ProfileFormState, FormData>(saveMyChild, {});
  return (
    <Form run={run} state={state}>
      <input type="hidden" name="child" value={child.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" name="firstName" label="First name" defaultValue={child.firstName} />
        <Field id="lastName" name="lastName" label="Last name" defaultValue={child.lastName} />
      </div>
      <Field id="dateOfBirth" name="dateOfBirth" label="Date of birth" type="date" defaultValue={child.dateOfBirth ?? ""} max={today} />
      <Outcome state={state} pending={pending} saved={`${child.firstName}'s details are saved.`} />
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </button>
    </Form>
  );
}

export function AddChildForm({ groups, lastName, today }: { groups: Group[]; lastName: string; today: string }) {
  const [state, run, pending] = useActionState<ProfileFormState, FormData>(addChild, {});
  return (
    <Form run={run}>
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" name="firstName" label="First name" />
        <Field id="lastName" name="lastName" label="Last name" defaultValue={lastName} />
      </div>
      <Field id="dateOfBirth" name="dateOfBirth" label="Date of birth" type="date" max={today} />
      <div>
        <label htmlFor="ageGroup" className="field-label">
          Group
        </label>
        <select id="ageGroup" name="ageGroup" defaultValue="" className="field">
          <option value="" disabled>
            Choose a group
          </option>
          {groups.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-sm text-ink-muted">Not sure? Pick your best guess. The club checks every new child&apos;s group.</p>
      </div>
      <Outcome state={state} pending={pending} saved="Added." />
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Adding…" : "Add child"}
      </button>
    </Form>
  );
}
