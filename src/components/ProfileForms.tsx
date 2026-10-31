"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { addChild, addParent, saveMyChild, saveMyDetails, type AddParentState, type ProfileFormState } from "@/lib/parent/actions";
import { useKeptActionState } from "@/components/submitKeepingInput";

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
      {hint ? <p className="mt-1.5 text-[15px] text-ink-muted">{hint}</p> : null}
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

function Form({ run, keep, state, children, className = "" }: { run: (formData: FormData) => void; keep: (e: FormEvent<HTMLFormElement>) => void; state?: ProfileFormState; children: ReactNode; className?: string }) {
  const form = useRef<HTMLFormElement>(null);
  // A new state object each time the action returns, so every save resets, not only the first.
  useEffect(() => {
    if (state?.saved) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={run} onSubmit={keep} className={`flex flex-col gap-4 ${className}`} noValidate>
      {children}
    </form>
  );
}

export function MyDetailsForm({ details }: { details: { firstName: string; lastName: string; phone: string | null } }) {
  const [state, run, pending, keep] = useKeptActionState<ProfileFormState>(saveMyDetails, {});
  return (
    <Form run={run} keep={keep} state={state}>
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
  const [state, run, pending, keep] = useKeptActionState<ProfileFormState>(saveMyChild, {});
  return (
    <Form run={run} keep={keep} state={state}>
      <input type="hidden" name="child" value={child.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" name="firstName" label="First name" defaultValue={child.firstName} />
        <Field id="lastName" name="lastName" label="Last name" defaultValue={child.lastName} />
      </div>
      <Field id="dateOfBirth" name="dateOfBirth" label="Date of birth" type="date" defaultValue={child.dateOfBirth ?? ""} max={today} hint="Day, month and year. The club uses it to check the age group." />
      <Outcome state={state} pending={pending} saved={`${child.firstName}'s details are saved.`} />
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </button>
    </Form>
  );
}

export function AddChildForm({ groups, lastName, today }: { groups: Group[]; lastName: string; today: string }) {
  const [state, run, pending, keep] = useKeptActionState<ProfileFormState>(addChild, {});
  return (
    <Form run={run} keep={keep}>
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" name="firstName" label="First name" />
        <Field id="lastName" name="lastName" label="Last name" defaultValue={lastName} />
      </div>
      <Field id="dateOfBirth" name="dateOfBirth" label="Date of birth" type="date" max={today} hint="Day, month and year. The club uses it to check the age group." />
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
        <p className="mt-1.5 text-[15px] text-ink-muted">Not sure? Pick your best guess. The club checks every new child&apos;s group.</p>
      </div>
      <Outcome state={state} pending={pending} saved="Added." />
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Adding…" : "Add child"}
      </button>
    </Form>
  );
}

/**
 * Player → Your family → Add the other parent. With one child the child is a hidden field; with several, a tick box
 * each, all ticked to start. Clears itself once they're added and says so.
 */
export function AddParentForm({ childList: children }: { childList: { id: string; firstName: string }[] }) {
  const [state, run, pending, keep] = useKeptActionState<AddParentState>(addParent, {});
  return (
    <Form run={run} keep={keep} state={state}>
      <div className="grid grid-cols-2 gap-3">
        <Field id="parentFirstName" name="firstName" label="First name" />
        <Field id="parentLastName" name="lastName" label="Last name" />
      </div>
      <Field id="parentEmail" name="email" label="Email address" type="email" hint="We email them a link to sign in. It's how they sign in from then on." />
      <Field id="parentPhone" name="phone" label="Mobile number (optional)" type="tel" inputMode="tel" />
      {children.length === 1 ? (
        <input type="hidden" name="child" value={children[0].id} />
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label">Their children</legend>
          {children.map((c) => (
            <label key={c.id} className="flex min-h-12 items-center gap-3 rounded-app border border-line bg-paper px-3.5 text-[15px] font-bold has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
              <input type="checkbox" name="child" value={c.id} defaultChecked className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
              {c.firstName}
            </label>
          ))}
        </fieldset>
      )}
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Adding…" : "Add parent"}
      </button>
    </Form>
  );
}
