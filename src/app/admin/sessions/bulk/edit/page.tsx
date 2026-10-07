import type { Metadata } from "next";
import { BulkHeader, BulkSessionList, NothingToDo, count } from "@/components/admin/BulkSessionList";
import { Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { bulkEditSessions } from "@/lib/admin/actions";
import { BULK_MAX, parseIds } from "@/lib/admin/bulk-sessions";
import { loadAdminSessions } from "@/lib/admin/data";
import { coachLimit, requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Edit sessions" };

// Change the same details on every ticked session at once. Every field starts blank and only a filled-in one is
// applied; blank ones leave each session's own value as it is (so a field can't be cleared here: use the single
// Edit page for that). Groups change only with "Change groups" ticked. The ids come from `?ids=`.
export default async function BulkEdit({ searchParams }: PageProps<"/admin/sessions/bulk/edit">) {
  const user = await requireStaff();
  const ids = parseIds((await searchParams).ids).slice(0, BULK_MAX);
  const { sessions, notYours } = await asUser(user.id, (tx) => loadAdminSessions(tx, ids, coachLimit(user.staff)));
  const anySquad = sessions.some((s) => s.picked > 0);

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <BulkHeader title={sessions.length ? `Edit ${count(sessions.length)}` : "Edit sessions"} notYours={notYours} />
      {sessions.length === 0 ? (
        <NothingToDo>None of the sessions you ticked can be changed here.</NothingToDo>
      ) : (
        <Section title="What changes">
          <p className="text-[15px] text-ink-muted">Fill in only what should change. Anything left blank stays as it is on each session.</p>
          <StatefulForm action={bulkEditSessions} submitLabel={`Save ${count(sessions.length)}`}>
            <BulkSessionList sessions={sessions} ids={sessions.map((s) => s.id)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="title" className="field-label">
                  Title
                </label>
                <input id="title" name="title" maxLength={60} placeholder="Keep as it is" className="field" />
              </div>
              <div>
                <label htmlFor="kind" className="field-label">
                  Kind
                </label>
                <select id="kind" name="kind" defaultValue="" className="field">
                  <option value="">Keep as it is</option>
                  <option value="training">Training</option>
                  <option value="match">Match</option>
                  <option value="tournament">Tournament</option>
                </select>
              </div>
              <div>
                <label htmlFor="start" className="field-label">
                  Starts <span className="font-normal text-ink-muted">(on each session&apos;s own day)</span>
                </label>
                <input id="start" name="start" type="time" className="field" />
              </div>
              <div>
                <label htmlFor="end" className="field-label">
                  Finishes
                </label>
                <input id="end" name="end" type="time" className="field" />
              </div>
            </div>
            <div>
              <label htmlFor="venue" className="field-label">
                Venue
              </label>
              <input id="venue" name="venue" maxLength={120} placeholder="Keep as it is" className="field" />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="field-label">Groups</legend>
              <label className="flex min-h-12 items-center gap-3 text-[15px]">
                <input type="checkbox" name="changeGroups" className="h-5 w-5 accent-[var(--grass)]" />
                <span>
                  <b>Change groups</b> to the ones ticked below (otherwise each session keeps its own)
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {staffGroups(user.staff).map((g) => (
                  <label key={g} className="flex min-h-12 items-center gap-2 rounded-pill border-2 border-line bg-paper px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
                    <input type="checkbox" name="groups" value={g} className="h-4 w-4 accent-[var(--grass)]" />
                    <span className="text-sm font-extrabold">{g}</span>
                  </label>
                ))}
              </div>
              {anySquad ? <p className="text-[13px] text-ink-muted">If a group comes off a session with a squad, its children come out of that squad.</p> : null}
            </fieldset>
            <p className="-mb-1 text-sm font-bold">Briefing parents see on the Friday screen</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="arriveBy" className="field-label">
                  Arrive by
                </label>
                <input id="arriveBy" name="arriveBy" placeholder="Keep as it is" maxLength={20} className="field" />
              </div>
              <div>
                <label htmlFor="kit" className="field-label">
                  Kit
                </label>
                <input id="kit" name="kit" placeholder="Keep as it is" maxLength={120} className="field" />
              </div>
              <div>
                <label htmlFor="prayerNote" className="field-label">
                  Prayer
                </label>
                <input id="prayerNote" name="prayerNote" placeholder="Keep as it is" maxLength={120} className="field" />
              </div>
            </div>
            <div>
              <label htmlFor="notes" className="field-label">
                Notes for parents
              </label>
              <textarea id="notes" name="notes" rows={3} maxLength={500} placeholder="Keep as they are" className="field" />
            </div>
            <p className="text-[13px] text-ink-muted">Answers stay when you change the times.</p>
            <label className="flex min-h-12 items-center gap-3 text-[15px]">
              <input type="checkbox" name="notify" className="h-5 w-5 accent-[var(--grass)]" />
              <span>
                <b>Tell the families about this change</b> in club news (one message per session), by app notification and email straight away
              </span>
            </label>
          </StatefulForm>
        </Section>
      )}
    </div>
  );
}
