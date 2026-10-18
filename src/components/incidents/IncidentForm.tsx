"use client";

import { useActionState, useId } from "react";
import { saveIncident, type IncidentFormState } from "@/lib/incidents/actions";
import { INCIDENT_KINDS, INCIDENT_TEXT_MAX } from "@/lib/incidents/kinds";
import { submitKeepingInput } from "../submitKeepingInput";

type Child = { id: string; name: string; group: string };

/** Log an accident or incident: one plain form (works before the script loads); keeps what was typed after an error. */
export function IncidentForm({ childList: children, childId, sessionId, sessionLabel, now }: { childList: Child[]; childId: string | null; sessionId: string | null; sessionLabel: string | null; now: string }) {
  const [state, run, saving] = useActionState<IncidentFormState, FormData>(saveIncident, {});
  const id = useId();
  const groups = [...new Set(children.map((c) => c.group))];
  return (
    <form action={run} onSubmit={submitKeepingInput(run)} className="flex flex-col gap-4">
      {sessionId ? <input type="hidden" name="session" value={sessionId} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-child`} className="field-label">
          Child
        </label>
        <select id={`${id}-child`} name="child" defaultValue={childId ?? ""} required className="field">
          <option value="" disabled>
            Choose a child
          </option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {children
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="field-label">What kind</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(INCIDENT_KINDS).map(([value, label], i) => (
            <label key={value} className="relative inline-flex min-h-12 cursor-pointer items-center rounded-pill border-2 border-line bg-paper px-4 text-[15px] font-bold has-[:checked]:border-ink has-[:checked]:bg-cream has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
              <input type="radio" name="kind" value={value} defaultChecked={i === 0} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-when`} className="field-label">
          When
        </label>
        <input id={`${id}-when`} name="happenedAt" type="datetime-local" defaultValue={now} required className="field w-auto self-start" />
        {sessionLabel ? <p className="text-[13px] text-ink-muted">At {sessionLabel}.</p> : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-what`} className="field-label">
          What happened
        </label>
        <textarea id={`${id}-what`} name="whatHappened" rows={4} maxLength={INCIDENT_TEXT_MAX} required className="field" placeholder="For example: fell in a tackle and hurt his left knee." />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-action`} className="field-label">
          What we did
        </label>
        <textarea id={`${id}-action`} name="actionTaken" rows={3} maxLength={INCIDENT_TEXT_MAX} required className="field" placeholder="For example: ice pack, sat out 10 minutes, carried on. Told his dad at pick-up." />
      </div>
      <p className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
        The child&apos;s parents get this in the app straight away, from you, and can reply. The club&apos;s admins are told too. It&apos;s kept as a
        club record and can&apos;t be changed afterwards.
      </p>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={saving} className="btn-chunky btn-grass self-start">
        {saving ? "Sending…" : "Log it and tell the parents"}
      </button>
    </form>
  );
}
