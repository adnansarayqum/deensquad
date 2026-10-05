import type { Metadata } from "next";
import Link from "next/link";
import { AdminTitle, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { addSessions, deleteSession, setSessionCancelled } from "@/lib/admin/actions";
import { loadSessionsAdmin, type AdminSession } from "@/lib/admin/data";
import { within } from "@/lib/admin/scope";
import { coachLimit, requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, londonDate, nextFridaySession, shortDay } from "@/lib/dates";
import type { AgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const user = await requireStaff();
  const now = new Date();
  const mine = coachLimit(user.staff);
  const { upcoming, recent, lastVenue } = await asUser(user.id, (tx) => loadSessionsAdmin(tx, now, mine));
  const friday = londonDate(nextFridaySession(now).start);
  const firstDate = `${friday.year}-${String(friday.month).padStart(2, "0")}-${String(friday.day).padStart(2, "0")}`;

  return (
    <>
      <AdminTitle>Sessions</AdminTitle>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
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
                {staffGroups(user.staff).map((g) => (
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

        <div className="flex flex-col gap-4">
          <SessionList title="Coming up" sessions={upcoming} mine={mine} editable />
          {recent.length ? <SessionList title="Recent" sessions={recent} mine={mine} /> : null}
        </div>
      </div>
    </>
  );
}

function SessionList({ title, sessions, mine, editable = false }: { title: string; sessions: AdminSession[]; mine: AgeGroup[] | null; editable?: boolean }) {
  // A group coach changes only sessions for their own groups; joint sessions are left to admins.
  const canChange = (s: AdminSession) => editable && (!mine || within(s.ageGroups, mine));
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
              {editable ? `${s.coming} ${s.picked ? "confirmed" : "coming"} · ${s.away} ${s.picked ? "can't play" : "away"}` : `${s.attended} checked in`}
            </span>
            {s.picked ? <span className="text-[13px] font-bold">Squad: {s.picked} picked</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {s.cancelled ? <Pill tone="action">Cancelled</Pill> : null}
            {/* Tournament squads: pick who plays (matches and tournaments, or any session that already has a squad). */}
            {canChange(s) && (s.picked > 0 || s.kind !== "training") ? (
              <Link href={`/admin/sessions/${s.id}/squad`} className="btn-chunky btn-paper btn-small" aria-label={`${s.picked ? "Squad" : "Pick squad"} for ${s.title} ${shortDay(s.startsAt)}`}>
                {s.picked ? "Squad" : "Pick squad"}
              </Link>
            ) : null}
            {canChange(s) ? (
              <form action={setSessionCancelled}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="cancel" value={s.cancelled ? "no" : "yes"} />
                <button type="submit" className="btn-chunky btn-paper btn-small">
                  {s.cancelled ? "Restore" : "Cancel"}
                </button>
              </form>
            ) : null}
            {canChange(s) && s.attended === 0 ? (
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
