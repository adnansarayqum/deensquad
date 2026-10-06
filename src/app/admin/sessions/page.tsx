import type { Metadata } from "next";
import Link from "next/link";
import { AdminTitle, Notice, Section } from "@/components/admin/bits";
import { SessionFields } from "@/components/admin/SessionFields";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { addSessions } from "@/lib/admin/actions";
import { loadSessionsAdmin, type AdminSession } from "@/lib/admin/data";
import { within } from "@/lib/admin/scope";
import { coachLimit, requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, londonDate, nextFridaySession, shortDay } from "@/lib/dates";
import type { AgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage({ searchParams }: PageProps<"/admin/sessions">) {
  const user = await requireStaff();
  const params = await searchParams;
  const now = new Date();
  const mine = coachLimit(user.staff);
  const { upcoming, recent, lastVenue } = await asUser(user.id, (tx) => loadSessionsAdmin(tx, now, mine));
  const friday = londonDate(nextFridaySession(now).start);
  const firstDate = `${friday.year}-${String(friday.month).padStart(2, "0")}-${String(friday.day).padStart(2, "0")}`;

  return (
    <>
      <AdminTitle>Sessions</AdminTitle>

      {params.cancelled ? <Notice>{params.told ? "Cancelled. The families have been told." : "Cancelled."}</Notice> : null}
      {params.restored ? <Notice>{params.told ? "Back on. The families have been told." : "Back on."}</Notice> : null}
      {params.deleted ? <Notice>Deleted.</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Section title="Add sessions">
          <StatefulForm action={addSessions} submitLabel="Add sessions" savedMessage="Sessions added. Parents can answer straight away.">
            <SessionFields repeat groups={staffGroups(user.staff)} defaults={{ date: firstDate, start: "18:30", end: "20:00", venue: lastVenue ?? "", groups: staffGroups(user.staff) }} />
            <p className="text-[13px] text-ink-muted">Dates that already have a session at the same time for one of these groups are skipped.</p>
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
            {s.cancelReason ? <span className="text-[13px]">Reason: {s.cancelReason}</span> : null}
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
              <Link href={`/admin/sessions/${s.id}/edit`} className="btn-chunky btn-paper btn-small" aria-label={`Edit ${s.title} ${shortDay(s.startsAt)}`}>
                Edit
              </Link>
            ) : null}
            {canChange(s) ? (
              <Link
                href={`/admin/sessions/${s.id}/cancel`}
                className="btn-chunky btn-paper btn-small"
                aria-label={`${s.cancelled ? "Restore" : "Cancel"} ${s.title} ${shortDay(s.startsAt)}`}
              >
                {s.cancelled ? "Restore" : "Cancel"}
              </Link>
            ) : null}
            {/* Never once anyone has been checked in, so attendance history is kept. */}
            {canChange(s) && s.attended === 0 ? (
              <Link
                href={`/admin/sessions/${s.id}/delete`}
                className="inline-flex min-h-12 items-center px-2 text-sm font-bold text-ink-muted underline"
                aria-label={`Delete ${s.title} ${shortDay(s.startsAt)}`}
              >
                Delete
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
