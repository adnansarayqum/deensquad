import type { Metadata } from "next";
import Link from "next/link";
import { FoldCard, Notice, PageHeader } from "@/components/admin/bits";
import { SessionFields } from "@/components/admin/SessionFields";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { addSessions } from "@/lib/admin/actions";
import { loadSessionsAdmin, type AdminSession } from "@/lib/admin/data";
import { within } from "@/lib/admin/scope";
import { coachLimit, requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, londonDate, nextFridaySession, shortDay } from "@/lib/dates";
import { defaultSessionGroups } from "@/lib/domain";
import type { AgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Sessions" };

/** Coming up shows this many by default; "Show all" (`?all=1`) lists the rest. */
const UPCOMING_SHOWN = 8;

export default async function SessionsPage({ searchParams }: PageProps<"/admin/sessions">) {
  const user = await requireStaff();
  const params = await searchParams;
  const now = new Date();
  const mine = coachLimit(user.staff);
  const { upcoming, recent, lastVenue } = await asUser(user.id, (tx) => loadSessionsAdmin(tx, now, mine));
  const friday = londonDate(nextFridaySession(now).start);
  const firstDate = `${friday.year}-${String(friday.month).padStart(2, "0")}-${String(friday.day).padStart(2, "0")}`;
  const showAll = params.all === "1" || upcoming.length <= UPCOMING_SHOWN;
  const shown = showAll ? upcoming : upcoming.slice(0, UPCOMING_SHOWN);

  return (
    <>
      <PageHeader title="Sessions" subtitle={upcoming.length ? `${upcoming.length} coming up` : "Nothing coming up yet"} />

      {params.cancelled ? <Notice>{params.told ? "Cancelled. The families have been told." : "Cancelled."}</Notice> : null}
      {params.restored ? <Notice>{params.told ? "Back on. The families have been told." : "Back on."}</Notice> : null}
      {params.deleted ? <Notice>Deleted.</Notice> : null}

      {/* Folded at every size (the eight-column table needs the whole column), open when there's nothing to list yet. */}
      <FoldCard id="add-sessions" title="Add sessions" open={upcoming.length === 0}>
        <div className="lg:max-w-3xl">
          <StatefulForm action={addSessions} submitLabel="Add sessions" savedMessage="Sessions added. Parents can answer straight away.">
            <SessionFields repeat groups={staffGroups(user.staff)} defaults={{ date: firstDate, start: "18:30", end: "20:00", venue: lastVenue ?? "", groups: defaultSessionGroups(staffGroups(user.staff)) }} />
            <p className="text-[13px] text-ink-muted">Dates that already have a session at the same time for one of these groups are skipped.</p>
          </StatefulForm>
        </div>
      </FoldCard>

      <section aria-labelledby="coming-up" className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
            <h2 id="coming-up" className="text-[17px] font-extrabold">
              Coming up
            </h2>
            {upcoming.length === 0 ? <p className="text-[15px] text-ink-muted">None yet. Add the term&apos;s sessions and parents can answer straight away.</p> : <SessionTable sessions={shown} mine={mine} editable />}
            {showAll ? null : (
              <Link href="/admin/sessions?all=1#coming-up" className="inline-flex min-h-12 items-center self-start text-sm font-bold text-grass-text underline">
                Show all {upcoming.length} upcoming
              </Link>
            )}
      </section>
      {recent.length ? (
        <details className="rounded-app border-2 border-line bg-paper px-4">
          <summary className="flex min-h-12 cursor-pointer items-center text-[17px] font-extrabold">Recent sessions ({recent.length})</summary>
          <div className="pb-4">
            <SessionTable sessions={recent} mine={mine} />
          </div>
        </details>
      ) : null}
    </>
  );
}

/** A row's action: a text link, 48px tall to tap, so four fit on one line of a table. */
const action = "inline-flex min-h-12 items-center px-2 text-sm font-bold text-grass-text underline underline-offset-4";

/** One row per session: a table at lg, compact cards on phones. The same actions in both. */
function SessionTable({ sessions, mine, editable = false }: { sessions: AdminSession[]; mine: AgeGroup[] | null; editable?: boolean }) {
  // A group coach changes only sessions for their own groups; joint sessions are left to admins.
  const canChange = (s: AdminSession) => editable && (!mine || within(s.ageGroups, mine));
  const answers = (s: AdminSession) => (editable ? `${s.coming} ${s.picked ? "confirmed" : "coming"} · ${s.away} ${s.picked ? "can't play" : "away"}` : `${s.attended} checked in`);
  const status = (s: AdminSession) => (
    <span className="flex flex-wrap items-center gap-1.5">
      {s.cancelled ? <Pill tone="action">Cancelled</Pill> : null}
      {s.picked ? <Pill tone="neutral">Squad: {s.picked} picked</Pill> : null}
      {!s.cancelled && !s.picked ? <span className="text-[13px] text-ink-muted">{editable ? "On" : "Held"}</span> : null}
    </span>
  );
  const actions = (s: AdminSession) =>
    canChange(s) ? (
      <span className="-mx-2 flex flex-wrap items-center">
        {/* Tournament squads: pick who plays (matches and tournaments, or any session that already has a squad). */}
        {s.picked > 0 || s.kind !== "training" ? (
          <Link href={`/admin/sessions/${s.id}/squad`} className={action} aria-label={`${s.picked ? "Squad" : "Pick squad"} for ${s.title} ${shortDay(s.startsAt)}`}>
            {s.picked ? "Squad" : "Pick squad"}
          </Link>
        ) : null}
        <Link href={`/admin/sessions/${s.id}/edit`} className={action} aria-label={`Edit ${s.title} ${shortDay(s.startsAt)}`}>
          Edit
        </Link>
        <Link href={`/admin/sessions/${s.id}/cancel`} className={action} aria-label={`${s.cancelled ? "Restore" : "Cancel"} ${s.title} ${shortDay(s.startsAt)}`}>
          {s.cancelled ? "Restore" : "Cancel"}
        </Link>
        {/* Never once anyone has been checked in, so attendance history is kept. */}
        {s.attended === 0 ? (
          <Link href={`/admin/sessions/${s.id}/delete`} className={`${action} text-ink-muted`} aria-label={`Delete ${s.title} ${shortDay(s.startsAt)}`}>
            Delete
          </Link>
        ) : null}
      </span>
    ) : null;

  return (
    <>
      {/* Phones: one compact card per session. */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 rounded-dash border-2 border-line bg-cream px-3.5 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">
                {shortDay(s.startsAt)} · {s.title} {clock(s.startsAt)}–{clock(s.endsAt)}
              </span>
              <span className="text-[13px] text-ink-muted">
                {s.ageGroups.join(", ")} · {s.venue}
              </span>
              <span className="text-[13px]">{answers(s)}</span>
              {s.cancelReason ? <span className="text-[13px]">Reason: {s.cancelReason}</span> : null}
            </div>
            {s.cancelled || s.picked ? status(s) : null}
            {actions(s)}
          </li>
        ))}
      </ul>

      {/* Computers: a table, one row per session. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-[14px]">
          <caption className="sr-only">{editable ? "Sessions coming up" : "Recent sessions"}</caption>
          <thead>
            <tr className="border-b-2 border-line text-left text-label text-ink-muted uppercase">
              <th scope="col" className="px-2 py-2.5 font-bold">
                Date
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Session
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Time
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Groups
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Venue
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                {editable ? "Answers" : "Checked in"}
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Status
              </th>
              {editable ? (
                <th scope="col" className="px-2 py-2.5 font-bold">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t border-line align-middle hover:bg-cream">
                <th scope="row" className="px-2 py-2 text-left font-bold whitespace-nowrap">
                  {shortDay(s.startsAt)}
                </th>
                <td className="px-2 py-2">
                  <span className="font-bold">{s.title}</span>
                  {s.cancelReason ? <span className="block text-[13px] text-ink-muted">Reason: {s.cancelReason}</span> : null}
                </td>
                <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                  {clock(s.startsAt)}–{clock(s.endsAt)}
                </td>
                <td className="px-2 py-2">{s.ageGroups.join(", ")}</td>
                <td className="max-w-56 px-2 py-2 text-ink-muted">{s.venue}</td>
                <td className="px-2 py-2 whitespace-nowrap tabular-nums">{answers(s)}</td>
                <td className="px-2 py-2">{status(s)}</td>
                {editable ? <td className="px-2 py-2">{actions(s)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
