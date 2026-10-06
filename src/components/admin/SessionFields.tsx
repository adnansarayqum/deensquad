import type { AgeGroup, Session } from "@/lib/domain";

/** "2026-10-09" in London, for a date input. */
export function londonDateInput(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** "18:30" in London, for a time input. */
export function londonTimeInput(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

type Defaults = Partial<Pick<Session, "title" | "kind" | "venue" | "arriveBy" | "kit" | "prayerNote" | "notes">> & {
  date: string;
  start: string;
  end: string;
  groups: readonly AgeGroup[];
};

/**
 * The fields of the Add sessions and Edit session forms (the action is `sessionFields` in lib/admin/actions.ts).
 * `repeat` adds "Repeat every week until"; `groups` are the age groups this member of staff can choose.
 */
export function SessionFields({ defaults, groups, repeat = false }: { defaults: Defaults; groups: readonly AgeGroup[]; repeat?: boolean }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="title" className="field-label">
            Title
          </label>
          <input id="title" name="title" defaultValue={defaults.title ?? "Training"} maxLength={60} className="field" />
        </div>
        <div>
          <label htmlFor="kind" className="field-label">
            Kind
          </label>
          <select id="kind" name="kind" defaultValue={defaults.kind ?? "training"} className="field">
            <option value="training">Training</option>
            <option value="match">Match</option>
            <option value="tournament">Tournament</option>
          </select>
        </div>
        <div>
          <label htmlFor="date" className="field-label">
            Date
          </label>
          <input id="date" name="date" type="date" defaultValue={defaults.date} className="field" />
        </div>
        {repeat ? (
          <div>
            <label htmlFor="until" className="field-label">
              Repeat every week until <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input id="until" name="until" type="date" className="field" />
          </div>
        ) : null}
        <div>
          <label htmlFor="start" className="field-label">
            Starts
          </label>
          <input id="start" name="start" type="time" defaultValue={defaults.start} className="field" />
        </div>
        <div>
          <label htmlFor="end" className="field-label">
            Finishes
          </label>
          <input id="end" name="end" type="time" defaultValue={defaults.end} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="venue" className="field-label">
          Venue
        </label>
        <input id="venue" name="venue" defaultValue={defaults.venue ?? ""} maxLength={120} className="field" />
      </div>
      <fieldset>
        <legend className="field-label">Age groups</legend>
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <label key={g} className="flex min-h-12 items-center gap-2 rounded-pill border-2 border-line bg-paper px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
              <input type="checkbox" name="groups" value={g} defaultChecked={defaults.groups.includes(g)} className="h-4 w-4 accent-[var(--grass)]" />
              <span className="text-sm font-extrabold">{g}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="-mb-1 text-sm font-bold">Briefing parents see on the Friday screen (optional)</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="arriveBy" className="field-label">
            Arrive by
          </label>
          <input id="arriveBy" name="arriveBy" defaultValue={defaults.arriveBy ?? ""} placeholder="6:20pm" maxLength={20} className="field" />
        </div>
        <div>
          <label htmlFor="kit" className="field-label">
            Kit
          </label>
          <input id="kit" name="kit" defaultValue={defaults.kit ?? ""} placeholder="Green top, shin pads, water" maxLength={120} className="field" />
        </div>
        <div>
          <label htmlFor="prayerNote" className="field-label">
            Prayer
          </label>
          <input id="prayerNote" name="prayerNote" defaultValue={defaults.prayerNote ?? ""} placeholder="Prayer break in the session" maxLength={120} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className="field-label">
          Notes for parents <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes ?? ""} maxLength={500} placeholder="Where to meet, travel, parking" className="field" />
      </div>
    </>
  );
}
