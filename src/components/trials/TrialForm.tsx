"use client";

import { useId, useState } from "react";
import { bookTrialAction, type TrialFormState } from "@/lib/trials/actions";
import { useKeptActionState } from "../submitKeepingInput";

export type TrialSessionOption = { id: string; label: string; detail: string; groups: string[] };

/**
 * The public trial booking form. A plain form (it works before the script loads, listing every session with its
 * groups); with JavaScript, choosing the group shows only that group's sessions. Keeps what was typed after an error.
 */
export function TrialForm({ groups, sessions, fee, privacyHref }: { groups: { value: string; label: string }[]; sessions: TrialSessionOption[]; fee: string; privacyHref: string }) {
  const [state, run, saving, keep] = useKeptActionState<TrialFormState>(bookTrialAction, {});
  const [group, setGroup] = useState("");
  const id = useId();
  const shown = group ? sessions.filter((s) => s.groups.includes(group)) : sessions;
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-${name}`} className="field-label">
        {label}
      </label>
      <input id={`${id}-${name}`} name={name} className="field" {...props} />
    </div>
  );
  return (
    <form action={run} onSubmit={keep} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-base font-extrabold">Your child</legend>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          {field("childFirstName", "First name", { required: true, autoComplete: "off" })}
          {field("childLastName", "Last name", { required: true, autoComplete: "off" })}
        </div>
        {field("dateOfBirth", "Date of birth", { type: "date", required: true })}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-group`} className="field-label">
            Group
          </label>
          <select id={`${id}-group`} name="ageGroup" required className="field" value={group} onChange={(e) => setGroup(e.target.value)}>
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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-extrabold">Which session</legend>
        {shown.length === 0 ? (
          <p className="text-[15px] text-ink-muted">{group ? `No ${group} sessions in the next four weeks. Contact the club.` : "No sessions to book in the next four weeks."}</p>
        ) : (
          shown.map((s) => (
            <label
              key={s.id}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-app border-2 border-line bg-paper p-3 has-[:checked]:border-grass has-[:checked]:bg-grass-tint"
            >
              <input type="radio" name="session" value={s.id} required className="mt-1 h-5 w-5 shrink-0 accent-[var(--grass)]" />
              <span className="flex flex-col">
                <span className="text-[15px] font-bold">{s.label}</span>
                <span className="text-sm text-ink-muted">{s.detail}</span>
              </span>
            </label>
          ))
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-base font-extrabold">You</legend>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          {field("parentFirstName", "First name", { required: true, autoComplete: "given-name" })}
          {field("parentLastName", "Last name", { required: true, autoComplete: "family-name" })}
        </div>
        {field("email", "Email", { type: "email", required: true, autoComplete: "email" })}
        {field("phone", "Mobile (optional)", { type: "tel", autoComplete: "tel" })}
      </fieldset>

      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
        A trial session costs <b>{fee}</b>, paid by card at the gate on the day.
      </p>
      <label className="flex min-h-12 items-start gap-3 text-[15px]">
        <input type="checkbox" name="privacy" value="yes" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--grass)]" />
        <span>
          I&apos;ve read{" "}
          <a href={privacyHref} target="_blank" rel="noopener noreferrer" className="font-bold text-grass-text underline">
            how the club uses this information
          </a>
          .
        </span>
      </label>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={saving} className="btn-chunky btn-grass">
        {saving ? "Booking…" : "Book the trial"}
      </button>
    </form>
  );
}
