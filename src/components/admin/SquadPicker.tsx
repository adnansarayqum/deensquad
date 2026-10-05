"use client";

import { useActionState, useState } from "react";
import { submitKeepingInput } from "@/components/submitKeepingInput";
import { Pill } from "@/components/ui";
import type { FormState } from "@/lib/admin/actions";
import { saveSquadPicks } from "@/lib/admin/actions";
import type { SquadChild } from "@/lib/squads/squads";

const INITIAL: FormState = {};

/** The family's answer for a picked child, in words (colour only backs the word up). */
export function AnswerPill({ answer }: { answer: SquadChild["answer"] }) {
  if (answer === "coming") return <Pill tone="done">Confirmed</Pill>;
  // Needs action: the club picks a reserve.
  if (answer === "away") return <Pill tone="action">Can&apos;t play</Pill>;
  return <Pill tone="neutral">Not answered</Pill>;
}

/**
 * Tick the children who play. The ticks are kept in state, so the count stays right and nothing is
 * cleared if saving fails; the saved squad comes back from the server as the new starting point.
 */
export function SquadPicker({ sessionId, title, list }: { sessionId: string; title: string; list: SquadChild[] }) {
  const [picked, setPicked] = useState(() => new Set(list.filter((c) => c.picked).map((c) => c.id)));
  const [state, run, pending] = useActionState<FormState, FormData>(saveSquadPicks, INITIAL);
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const groups = new Set(list.map((c) => c.ageGroup));

  return (
    <form action={run} onSubmit={submitKeepingInput(run)} className="flex flex-col gap-3" aria-label="Pick the squad">
      <input type="hidden" name="session" value={sessionId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-bold tabular-nums" aria-live="polite">
          {picked.size} of {list.length} selected
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-chunky btn-paper btn-small" onClick={() => setPicked(new Set(list.map((c) => c.id)))}>
            Select all
          </button>
          <button type="button" className="btn-chunky btn-paper btn-small" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      </div>

      {list.length === 0 ? <p className="text-[15px] text-ink-muted">No children in these age groups yet.</p> : null}
      <table className="w-full border-separate border-spacing-y-1.5 text-left">
        <thead className="sr-only lg:not-sr-only">
          <tr className="text-label text-ink-muted uppercase">
            <th scope="col" className="px-3 pb-1 font-normal">
              Child
            </th>
            {groups.size > 1 ? (
              <th scope="col" className="hidden px-3 pb-1 font-normal lg:table-cell">
                Group
              </th>
            ) : null}
            <th scope="col" className="px-3 pb-1 text-right font-normal">
              Answer
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => {
            const on = picked.has(c.id);
            return (
              <tr key={c.id} className={on ? "bg-grass-tint" : "bg-paper"}>
                <td className={`rounded-l-app border-y-2 border-l-2 p-0 ${on ? "border-grass" : "border-line"}`}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      name="player"
                      value={c.id}
                      checked={on}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                      className="h-5 w-5 shrink-0 accent-[var(--grass)]"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[15px] font-bold">
                        {c.firstName} {c.lastName}
                      </span>
                      <span className="text-[13px] text-ink-muted lg:hidden">
                        {c.ageGroup}
                        {c.shirtNumber ? ` · No. ${c.shirtNumber}` : ""}
                      </span>
                    </span>
                  </label>
                </td>
                {groups.size > 1 ? (
                  <td className={`hidden border-y-2 px-3 text-sm lg:table-cell ${on ? "border-grass" : "border-line"}`}>{c.ageGroup}</td>
                ) : null}
                <td className={`rounded-r-app border-y-2 border-r-2 px-3 text-right ${on ? "border-grass" : "border-line"}`}>
                  {c.picked ? <AnswerPill answer={c.answer} /> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-sm text-ink-muted">
        Only the families of the children you pick see {title} and are asked if their child can play. Taking a child out hides it from them.
        Pick nobody to open it to every family in these groups again.
      </p>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          Squad saved.
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass self-start" disabled={pending}>
        {pending ? "Saving…" : "Save squad"}
      </button>
    </form>
  );
}
