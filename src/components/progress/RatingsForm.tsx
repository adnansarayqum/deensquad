"use client";


import { ChildAvatar } from "@/components/ChildAvatar";
import { useKeptActionState } from "@/components/submitKeepingInput";
import { saveRatings, type ProgressFormState } from "@/lib/progress/actions";
import { CATEGORIES, type Scores } from "@/lib/progress/ratings";

export type RatingFormRow = { id: string; firstName: string; lastInitial: string; photoId: string | null; here: boolean; mine: Scores | null };

const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * The ratings page's one form: a row per child (checked in first, the rest marked "Not here"), five 1–5 radio groups
 * each, and one Save in a footer that stays on screen. A plain form (radios and hidden fields), so it works without
 * JavaScript; with it, typed scores stay after an error and each row gets a Clear button. Blank rows are left alone.
 */
export function RatingsForm({ sessionId, rows }: { sessionId: string; rows: RatingFormRow[] }) {
  const [state, run, pending, keep] = useKeptActionState<ProgressFormState>(saveRatings, {});

  const clear = (id: string) => {
    for (const input of document.querySelectorAll<HTMLInputElement>(`input[type=radio][name^="r.${id}."]`)) input.checked = false;
  };

  return (
    <form action={run} onSubmit={keep} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="session" value={sessionId} />
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const name = `${r.firstName} ${r.lastInitial}.`;
          return (
            <li key={r.id} className="rounded-app border-2 border-line bg-paper p-3">
              <input type="hidden" name="player" value={r.id} />
              <input type="hidden" name={`name.${r.id}`} value={r.firstName} />
              <fieldset className="flex flex-col gap-2">
                <legend className="flex w-full items-center gap-3 pb-1">
                  <ChildAvatar photoId={r.photoId} firstName={r.firstName} lastName={r.lastInitial} size={40} />
                  <span className={`min-w-0 flex-1 text-[16px] font-extrabold ${r.here ? "" : "text-ink-muted"}`}>
                    {name}
                    {r.here ? null : <span className="ml-2 text-[13px] font-bold">Not here</span>}
                    {r.mine ? <span className="ml-2 text-[13px] font-bold text-grass-text">Rated</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => clear(r.id)}
                    className="inline-flex min-h-12 shrink-0 items-center px-2 text-sm font-bold text-ink-muted underline"
                    aria-label={`Clear ${r.firstName}'s scores`}
                  >
                    Clear
                  </button>
                </legend>
                {CATEGORIES.map((c) => (
                  <div key={c.key} role="radiogroup" aria-label={`${c.label} for ${r.firstName}`} className="flex items-center gap-2">
                    <span aria-hidden className="min-w-0 flex-1 text-[14px] leading-[18px] font-bold">
                      {c.label}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {SCORES.map((n) => (
                        <label
                          key={n}
                          className="relative grid h-12 w-10 cursor-pointer place-items-center rounded-dash border-2 border-line bg-cream text-[16px] font-bold tabular-nums has-[:checked]:border-grass has-[:checked]:bg-grass has-[:checked]:text-on-grass has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
                        >
                          <input
                            type="radio"
                            name={`r.${r.id}.${c.key}`}
                            value={n}
                            defaultChecked={r.mine?.[c.key] === n}
                            aria-label={`${c.label} for ${r.firstName}: ${n} of 5`}
                            // Covers the whole chip, so a tap anywhere on it is a tap on the radio itself.
                            className="absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none opacity-0"
                          />
                          <span aria-hidden>{n}</span>
                        </label>
                      ))}
                    </span>
                  </div>
                ))}
              </fieldset>
            </li>
          );
        })}
      </ul>
      {/* Stays on screen at the bottom while the list scrolls under it. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 border-t-2 border-line bg-cream px-1 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        {state.error ? (
          <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
            {state.error}
          </p>
        ) : null}
        {state.saved && !pending ? (
          <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
            {state.message}
          </p>
        ) : null}
        <button type="submit" className="btn-chunky btn-grass self-end" disabled={pending}>
          {pending ? "Saving…" : "Save ratings"}
        </button>
      </div>
    </form>
  );
}
