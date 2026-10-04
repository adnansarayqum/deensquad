import type { Metadata } from "next";
import { AdminTitle, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { addSessions, deleteSession, setSessionCancelled } from "@/lib/admin/actions";
import { loadSessionsAdmin, type AdminSession } from "@/lib/admin/data";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, londonDate, nextFridaySession, shortDay } from "@/lib/dates";
import { AGE_GROUPS } from "@/lib/domain";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const user = await requireStaff();
  const now = new Date();
  const { upcoming, recent, lastVenue } = await asUser(user.id, (tx) => loadSessionsAdmin(tx, now));
  const friday = londonDate(nextFridaySession(now).start);
  const firstDate = `${friday.year}-${String(friday.month).padStart(2, "0")}-${String(friday.day).padStart(2, "0")}`;

  return (
    <>
      <AdminTitle>Sessions</AdminTitle>

      <Section title="Add sessions">
        <StatefulForm action={addSessions} submitLabel="Add sessions" savedMessage="Sessions added. Parents can answer straight away.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="title" className="field-label">
                Title
              </label>
              <input id="title" name="title" defaultValue="Training" maxLength={60} className="field" />
            </div>
            <div>
              <label htmlFor="kind" className="field-label">
                Kind
              </label>
              <select id="kind" name="kind" defaultValue="training" className="field">
                <option value="training">Training</option>
                <option value="match">Match</option>
                <option value="tournament">Tournament</option>
              </select>
            </div>
            <div>
              <label htmlFor="date" className="field-label">
                Date
              </label>
              <input id="date" name="date" type="date" defaultValue={firstDate} className="field" />
            </div>
            <div>
              <label htmlFor="until" className="field-label">
                Repeat every week until <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="until" name="until" type="date" className="field" />
            </div>
            <div>
              <label htmlFor="start" className="field-label">
                Starts
              </label>
              <input id="start" name="start" type="time" defaultValue="18:30" className="field" />
            </div>
            <div>
              <label htmlFor="end" className="field-label">
                Finishes
              </label>
              <input id="end" name="end" type="time" defaultValue="20:00" className="field" />
            </div>
          </div>
          <div>
            <label htmlFor="venue" className="field-label">
              Venue
            </label>
            <input id="venue" name="venue" defaultValue={lastVenue ?? ""} maxLength={120} className="field" />
          </div>
          <fieldset>
            <legend className="field-label">Age groups</legend>
            <div className="flex flex-wrap gap-2">
              {AGE_GROUPS.map((g) => (
                <label key={g} className="flex min-h-11 items-center gap-2 rounded-pill border-2 border-line bg-paper px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
                  <input type="checkbox" name="groups" value={g} defaultChecked className="h-4 w-4 accent-[var(--grass)]" />
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
              <input id="arriveBy" name="arriveBy" placeholder="6:20pm" maxLength={20} className="field" />
            </div>
            <div>
              <label htmlFor="kit" className="field-label">
                Kit
              </label>
              <input id="kit" name="kit" placeholder="Green top, shin pads, water" maxLength={120} className="field" />
            </div>
            <div>
              <label htmlFor="prayerNote" className="field-label">
                Prayer
              </label>
              <input id="prayerNote" name="prayerNote" placeholder="Prayer break in the session" maxLength={120} className="field" />
            </div>
          </div>
        </StatefulForm>
      </Section>

      <SessionList title="Coming up" sessions={upcoming} editable />
      {recent.length ? <SessionList title="Recent" sessions={recent} /> : null}
    </>
  );
}

function SessionList({ title, sessions, editable = false }: { title: string; sessions: AdminSession[]; editable?: boolean }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-label text-ink-muted uppercase">{title}</h2>
      {sessions.length === 0 ? <p className="text-[15px] text-ink-muted">None.</p> : null}
      {sessions.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-app border-2 border-line bg-paper px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-bold">
              {shortDay(s.startsAt)} · {s.title} {clock(s.startsAt)}–{clock(s.endsAt)}
            </span>
            <span className="text-[13px] text-ink-muted">
              {s.ageGroups.join(", ")} · {s.venue}
            </span>
            <span className="text-[13px]">
              {editable ? `${s.coming} coming · ${s.away} away` : `${s.attended} checked in`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {s.cancelled ? <Pill tone="action">Cancelled</Pill> : null}
            {editable ? (
              <form action={setSessionCancelled}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="cancel" value={s.cancelled ? "no" : "yes"} />
                <button type="submit" className="btn-chunky btn-paper btn-small">
                  {s.cancelled ? "Restore" : "Cancel"}
                </button>
              </form>
            ) : null}
            {editable && s.attended === 0 ? (
              <form action={deleteSession}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className="min-h-11 px-2 text-sm font-bold text-ink-muted underline">
                  Delete
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
