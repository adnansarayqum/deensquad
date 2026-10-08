"use client";

import { useActionState, useId, useState } from "react";
import { Search } from "lucide-react";
import { submitKeepingInput } from "@/components/submitKeepingInput";
import { Pill } from "@/components/ui";
import type { FormState } from "@/lib/admin/actions";
import { saveSquadPicks } from "@/lib/admin/actions";
import { matchesName } from "@/lib/search";
import type { SquadChild } from "@/lib/squads/squads";
import { ChildAvatar } from "@/components/ChildAvatar";

const INITIAL: FormState = {};

/** The family's answer for a picked child, in words (colour only backs the word up). */
export function AnswerPill({ answer }: { answer: SquadChild["answer"] }) {
  if (answer === "coming") return <Pill tone="done">Confirmed</Pill>;
  // Needs action: the club picks a reserve.
  if (answer === "away") return <Pill tone="action">Can&apos;t play</Pill>;
  return <Pill tone="neutral">Not answered</Pill>;
}

/** "8 of 10 sessions this season", or null before any register was taken for the child. */
export function seasonText(season: SquadChild["season"]): string | null {
  if (season.held === 0) return null;
  return `${season.attended} of ${season.held} ${season.held === 1 ? "session" : "sessions"} this season`;
}

/**
 * Tick the children who play. The ticks are kept in state, so the count stays right and nothing is
 * cleared if saving fails; the saved squad comes back from the server as the new starting point.
 * The group chips and the name search only hide rows (`hidden`): every checkbox stays in the form, so a
 * child picked in another group is still saved. Without JavaScript the whole list shows and the form posts.
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
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const shows = (c: SquadChild) => (group === null || c.ageGroup === group) && matchesName(query, c.firstName, c.lastName);
  const shown = list.filter(shows).length;
  // Select all and Clear act on the children on show, so a filter never touches another group's picks.
  const filtering = group !== null || query.trim() !== "";

  return (
    <form action={run} onSubmit={submitKeepingInput(run)} className="flex flex-col gap-3" aria-label="Pick the squad">
      <input type="hidden" name="session" value={sessionId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-bold tabular-nums" aria-live="polite">
          {picked.size} of {list.length} selected
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-chunky btn-paper btn-small" onClick={() => setPicked((prev) => new Set([...prev, ...list.filter(shows).map((c) => c.id)]))}>
            {filtering ? "Select these" : "Select all"}
          </button>
          <button type="button" className="btn-chunky btn-paper btn-small" onClick={() => setPicked((prev) => new Set([...prev].filter((id) => !list.some((c) => c.id === id && shows(c)))))}>
            {filtering ? "Clear these" : "Clear"}
          </button>
        </div>
      </div>

      {groups.size > 1 ? (
        <div role="group" aria-label="Show a group" className="flex flex-wrap gap-2">
          {[null, ...groups].map((g) => (
            <button
              key={g ?? "all"}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={`inline-flex min-h-12 min-w-14 items-center justify-center rounded-pill border-2 px-4 text-sm font-extrabold ${
                group === g ? "border-grass bg-grass text-on-grass" : "border-line bg-paper text-ink"
              }`}
            >
              {g ?? "All"}
              {g ? <span className="sr-only"> only</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {list.length > 0 ? (
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Find a child
          </label>
          <Search aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a child by name"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="field pl-10"
          />
        </div>
      ) : null}
      {list.length > 0 && shown === 0 ? (
        <p role="status" className="text-[15px] text-ink-muted">
          No child here matches. Picks in other groups are kept.
        </p>
      ) : null}

      {list.length === 0 ? <p className="text-[15px] text-ink-muted">No children in these groups yet.</p> : null}
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
              <tr key={c.id} hidden={!shows(c)} className={on ? "bg-grass-tint" : "bg-paper"}>
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
                    <ChildAvatar photoId={c.photoId} firstName={c.firstName} lastName={c.lastName} size={40} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[15px] font-bold">
                        {c.firstName} {c.lastName}
                      </span>
                      <span className="text-[13px] text-ink-muted">
                        <span className="lg:hidden">{c.ageGroup} · </span>
                        {c.shirtNumber ? `No. ${c.shirtNumber} · ` : ""}
                        {seasonText(c.season) ?? "No register taken yet this season"}
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
      {/* Stays on screen at the bottom while the list scrolls under it. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t-2 border-line bg-paper px-1 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
          {pending ? "Saving…" : `Save squad (${picked.size} picked)`}
        </button>
      </div>
    </form>
  );
}
