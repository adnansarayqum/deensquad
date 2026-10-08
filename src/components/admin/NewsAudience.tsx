"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { CHOSEN_MAX, reachSentence, shortName, type AudienceChoice, type NewsChild } from "@/lib/admin/news-audience";
import { matchesName } from "@/lib/search";

type Kind = AudienceChoice["kind"];
const noSubscribe = () => () => {};

/**
 * "Who is it for?" on the post form: Every family (admins), Only these groups, or Chosen children, with a line saying
 * who it will reach as staff tick. Plain form fields throughout, so it posts without JavaScript: the groups and the
 * child list show and hide with CSS (:has on the checked radio), and the whole list is in the page. With JavaScript
 * the name search and group chips only hide rows (`hidden`), so a child ticked in another group is still sent.
 */
export function NewsAudience({ limited, myGroups, list }: { limited: boolean; myGroups: readonly string[]; list: NewsChild[] }) {
  const [kind, setKind] = useState<Kind>(limited ? "groups" : "all");
  const [groups, setGroups] = useState<string[]>(limited && myGroups.length === 1 ? [...myGroups] : []);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  // The live line, chips and search need JavaScript, so they appear only once it has run.
  const live = useSyncExternalStore(noSubscribe, () => true, () => false);
  const searchId = useId();
  const reachId = useId();

  const listGroups = useMemo(() => [...new Set(list.map((c) => c.ageGroup))], [list]);
  const shows = (c: NewsChild) => (group === null || c.ageGroup === group) && matchesName(query, c.firstName, c.lastName);
  const shown = list.filter(shows).length;
  const choice: AudienceChoice = kind === "all" ? { kind } : kind === "groups" ? { kind, groups } : { kind, ids: chosen };
  const toggle = (id: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const radio = (value: Kind, label: string, checked: boolean) => (
    <label className="flex min-h-12 items-center gap-3 text-[15px] font-bold">
      <input
        type="radio"
        name="audience"
        value={value}
        defaultChecked={checked}
        onChange={(e) => e.target.checked && setKind(value)}
        className="h-5 w-5 accent-[var(--grass)]"
        aria-describedby={live ? reachId : undefined}
      />
      {label}
    </label>
  );

  return (
    // The groups show under "Only these groups" and the children under "Chosen children", without JavaScript too.
    <fieldset className="group/aud flex flex-col gap-2">
      <legend className="field-label">Who is it for?</legend>
      {limited ? null : radio("all", "Every family", true)}
      {radio("groups", limited ? (myGroups.length === 1 ? `Everyone in ${myGroups[0]}` : "Only these groups:") : "Only these groups:", limited)}
      <div className={`flex-wrap gap-2 pl-8 ${limited ? "flex group-has-[[value=children]:checked]/aud:hidden" : "hidden group-has-[[value=groups]:checked]/aud:flex"}`}>
        {myGroups.map((g) => (
          <label key={g} className="flex min-h-12 items-center gap-2 rounded-pill border-2 border-line bg-paper px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
            <input
              type="checkbox"
              name="groups"
              value={g}
              defaultChecked={limited && myGroups.length === 1}
              onChange={(e) => setGroups((prev) => (e.target.checked ? [...prev, g] : prev.filter((x) => x !== g)))}
              className="h-4 w-4 accent-[var(--grass)]"
            />
            <span className="text-sm font-extrabold">{g}</span>
          </label>
        ))}
      </div>
      {radio("children", "Chosen children", false)}

      <div className="hidden flex-col gap-2 pl-8 group-has-[[value=children]:checked]/aud:flex">
        {live ? (
          <>
            {listGroups.length > 1 ? (
              <div role="group" aria-label="Show a group" className="flex flex-wrap gap-2">
                {[null, ...listGroups].map((g) => (
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
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder="Find a child by name"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                className="field pl-10"
              />
            </div>
            <p className="text-[15px] font-bold tabular-nums" aria-live="polite">
              {chosen.size} chosen
            </p>
          </>
        ) : null}
        {list.length === 0 ? <p className="text-[15px] text-ink-muted">No children in the club yet.</p> : null}
        {live && list.length > 0 && shown === 0 ? (
          <p role="status" className="text-[15px] text-ink-muted">
            No child here matches. Children already chosen are kept.
          </p>
        ) : null}
        <ul aria-label="Children" className="flex max-h-96 flex-col gap-1.5 overflow-y-auto rounded-app border-2 border-line p-1.5">
          {list.map((c) => {
            const name = shortName(c.firstName, c.lastName);
            const on = chosen.has(c.id);
            return (
              <li key={c.id} hidden={!shows(c)}>
                <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[12px] border-2 px-3 py-1.5 ${on ? "border-grass bg-grass-tint" : "border-transparent"}`}>
                  <input
                    type="checkbox"
                    name="player"
                    value={c.id}
                    checked={on}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                    aria-label={`Choose ${name} (${c.ageGroup})`}
                    className="h-5 w-5 shrink-0 accent-[var(--grass)]"
                  />
                  <span className="min-w-0 flex-1 text-[15px] font-bold break-words">{name}</span>
                  <span className="shrink-0 text-[13px] text-ink-muted">{c.ageGroup}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-[13px] text-ink-muted">Only these children&apos;s parents see it. Up to {CHOSEN_MAX} children.</p>
      </div>

      {live ? (
        <p id={reachId} className="rounded-app bg-cream px-3.5 py-2.5 text-[15px] font-bold" aria-live="polite">
          {reachSentence(choice, list)}
        </p>
      ) : null}
    </fieldset>
  );
}
