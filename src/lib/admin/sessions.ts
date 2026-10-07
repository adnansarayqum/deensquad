import { clock, shortDay } from "../dates";
import { iso, type Queryable } from "../db/types";
import { AGE_GROUPS, type AgeGroup, type SessionKind } from "../domain";
import { within } from "./scope";

// Session changes made from Admin → Sessions. `mine` is a group coach's own groups (null = no limit):
// they can change only sessions for those groups alone, so joint sessions stay with admins.

async function sessionIsMine(tx: Queryable, id: string, mine: readonly AgeGroup[] | null): Promise<boolean> {
  const [row] = await tx.query<{ age_groups: string[] }>(`select age_groups::text[] as age_groups from sessions where id = $1`, [id]);
  return Boolean(row) && (!mine || within(row.age_groups, mine));
}

/**
 * Cancels (with an optional reason parents see) or restores a session. Restoring clears the reason.
 * False (and nothing changed) when it isn't the coach's to change.
 */
export async function cancelSession(
  tx: Queryable,
  id: string,
  cancel: boolean,
  mine: readonly AgeGroup[] | null,
  reason: string | null = null,
): Promise<boolean> {
  if (!(await sessionIsMine(tx, id, mine))) return false;
  // True only when this call actually flipped it, so a double tap or a second tab can't post the notice twice.
  const flipped = await tx.query(
    cancel
      ? `update sessions set cancelled_at = now(), cancel_reason = $2 where id = $1 and cancelled_at is null returning id`
      : `update sessions set cancelled_at = null, cancel_reason = null where id = $1 and cancelled_at is not null returning id`,
    cancel ? [id, reason] : [id],
  );
  return flipped.length > 0;
}

/** Deletes a session nobody has been checked in to, so attendance history is never lost. */
export async function removeSession(tx: Queryable, id: string, mine: readonly AgeGroup[] | null): Promise<boolean> {
  if (!(await sessionIsMine(tx, id, mine))) return false;
  const files = await planFileIds(tx, id);
  const gone = await tx.query(`delete from sessions s where s.id = $1 and not exists (select 1 from attendance a where a.session_id = s.id) returning s.id`, [id]);
  // Its plans went with it (cascade); their attached files would otherwise stay behind in club_files.
  if (gone.length && files.length) await tx.query(`delete from club_files where id = any($1::uuid[])`, [files]);
  return gone.length > 0;
}

/** The files attached to a session's plans. */
async function planFileIds(tx: Queryable, sessionId: string): Promise<string[]> {
  const rows = await tx.query<{ file_id: string }>(`select file_id from session_plans where session_id = $1 and file_id is not null`, [sessionId]);
  return rows.map((r) => r.file_id);
}

/** What deleting a session would take with it, for the confirmation. */
export type SessionLosses = { answers: number; plans: number; picked: number; messages: number; attended: number };

export async function sessionLosses(tx: Queryable, id: string): Promise<SessionLosses> {
  const [row] = await tx.query<SessionLosses>(
    `select
       (select count(*)::int from availability v where v.session_id = $1) as answers,
       (select count(*)::int from session_plans sp where sp.session_id = $1) as plans,
       (select count(*)::int from session_squads q where q.session_id = $1) as picked,
       (select count(*)::int from announcements a where a.squad_session_id = $1) as messages,
       (select count(*)::int from attendance at where at.session_id = $1) as attended`,
    [id],
  );
  return row;
}

/** "Delete Autumn Cup? 11 answers, 1 plan and the squad will be deleted. This can't be undone." */
export function lossesSentence(l: SessionLosses): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const parts = [
    l.answers ? n(l.answers, "answer", "answers") : null,
    l.plans ? n(l.plans, "session plan", "session plans") : null,
    l.picked ? `the squad of ${l.picked}` : null,
    l.messages ? n(l.messages, "squad message", "squad messages") : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return "Nothing else is attached to it yet. This can't be undone.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `${list[0].toUpperCase()}${list.slice(1)} will be deleted with it. This can't be undone.`;
}

// Adding sessions ---------------------------------------------------------------

export type NewSessions = {
  kind: SessionKind;
  title: string;
  venue: string;
  groups: AgeGroup[];
  /** One entry per date. */
  times: { start: Date; end: Date }[];
  arriveBy: string | null;
  kit: string | null;
  prayerNote: string | null;
  notes: string | null;
};

/**
 * Adds a session for each date, skipping any that already has a session (cancelled ones included, deleted ones not)
 * starting at the same time for at least one of the same groups, so adding a weekly term twice never duplicates.
 * Returns the start times added and skipped.
 */
export async function addSessionRun(tx: Queryable, run: NewSessions): Promise<{ added: Date[]; skipped: Date[] }> {
  const groups = AGE_GROUPS.filter((g) => run.groups.includes(g));
  const added: Date[] = [];
  const skipped: Date[] = [];
  for (const { start, end } of run.times) {
    const rows = await tx.query(
      `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups, arrive_by, kit, prayer_note, notes)
       select $1::session_kind, $2, $3, $4, $5, $6::text[]::age_group[], $7, $8, $9, $10
       where not exists (select 1 from sessions s where s.starts_at = $3 and s.age_groups && $6::text[]::age_group[])
       returning id`,
      [run.kind, run.title, start, end, run.venue, groups, run.arriveBy, run.kit, run.prayerNote, run.notes],
    );
    (rows.length ? added : skipped).push(start);
  }
  return { added, skipped };
}

/** "9 Oct" */
const dayMonth = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(at);

/** "Added 10 sessions. Skipped 2 that already existed (9 Oct, 16 Oct)." */
export function addedSentence({ added, skipped }: { added: Date[]; skipped: Date[] }): string {
  const head = added.length
    ? `Added ${added.length} ${added.length === 1 ? "session" : "sessions"}. Parents can answer straight away.`
    : "No sessions added.";
  if (skipped.length === 0) return head;
  const which = skipped.map(dayMonth).join(", ");
  return `${head} Skipped ${skipped.length} that already existed (${which}).`;
}

// Editing a session -------------------------------------------------------------

export type SessionEdit = {
  kind: SessionKind;
  title: string;
  venue: string;
  groups: AgeGroup[];
  start: Date;
  end: Date;
  arriveBy: string | null;
  kit: string | null;
  prayerNote: string | null;
  notes: string | null;
};

export type EditResult = { ok: true; squadRemoved: number; squadEmptied: boolean } | { ok: false; reason: "not_found" | "not_yours" };

/**
 * Saves a session's details. A group coach edits only sessions whose groups are all theirs, and only to groups
 * that are theirs. Answers stay when the date or time changes. With a squad, children no longer in the session's
 * groups are taken out of it, with their answers (as when taken out on the Squad page).
 */
export async function editSession(tx: Queryable, id: string, edit: SessionEdit, mine: readonly AgeGroup[] | null): Promise<EditResult> {
  const [row] = await tx.query<{ age_groups: string[] }>(`select age_groups::text[] as age_groups from sessions where id = $1`, [id]);
  if (!row) return { ok: false, reason: "not_found" };
  if (mine && !(within(row.age_groups, mine) && within(edit.groups, mine))) return { ok: false, reason: "not_yours" };
  const groups = AGE_GROUPS.filter((g) => edit.groups.includes(g));
  await tx.query(
    `update sessions set kind = $2::session_kind, title = $3, starts_at = $4, ends_at = $5, venue = $6, age_groups = $7::text[]::age_group[],
       arrive_by = $8, kit = $9, prayer_note = $10, notes = $11
     where id = $1`,
    [id, edit.kind, edit.title, edit.start, edit.end, edit.venue, groups, edit.arriveBy, edit.kit, edit.prayerNote, edit.notes],
  );
  const removed = await tx.query<{ player_id: string }>(
    `delete from session_squads q using players p
     where q.session_id = $1 and p.id = q.player_id and not (p.age_group = any ($2::text[]::age_group[]))
     returning q.player_id`,
    [id, groups],
  );
  if (removed.length) {
    await tx.query(`delete from availability where session_id = $1 and player_id = any ($2::uuid[])`, [id, removed.map((r) => r.player_id)]);
  }
  // Everyone picked came out: with no squad rows the session is open to the whole groups again.
  const left = removed.length ? await tx.query(`select 1 from session_squads where session_id = $1 limit 1`, [id]) : [1];
  return { ok: true, squadRemoved: removed.length, squadEmptied: left.length === 0 };
}

// Telling the families ------------------------------------------------------------

export type SessionNoticeKind = "cancelled" | "restored" | "changed";

/**
 * Posts club news about a session to the families it reaches: its groups, or only its squad's parents when it has
 * one. Urgent and asking for a tap, so the chase ladder pushes and emails it at once (see chase/ladder.ts).
 * Run it after the change, in the same transaction. Returns the message's id.
 */
export async function postSessionNotice(tx: Queryable, id: string, kind: SessionNoticeKind, staffId: string): Promise<string | null> {
  const [s] = await tx.query<{
    kind: SessionKind;
    title: string;
    starts_at: Date;
    ends_at: Date;
    venue: string;
    age_groups: string[];
    notes: string | null;
    arrive_by: string | null;
    cancel_reason: string | null;
    picked: number;
  }>(
    `select s.kind::text as kind, s.title, s.starts_at, s.ends_at, s.venue, s.age_groups::text[] as age_groups, s.notes, s.arrive_by, s.cancel_reason,
       (select count(*)::int from session_squads q where q.session_id = s.id) as picked
     from sessions s where s.id = $1`,
    [id],
  );
  if (!s) return null;
  const starts = iso(s.starts_at);
  const day = shortDay(starts);
  const when = `${s.age_groups.join(", ")} · ${day} · ${clock(starts)}–${clock(iso(s.ends_at))} · ${s.venue}`;
  const notice =
    kind === "cancelled"
      ? { title: `${s.title} on ${day} is cancelled`, body: [s.cancel_reason, `Cancelled: ${when}`] }
      : kind === "restored"
        ? { title: `${s.title} on ${day} is back on`, body: [`It's going ahead: ${when}`] }
        : {
            title: `${s.title} on ${day} has changed`,
            body: [`New details: ${when}`, s.arrive_by ? `Arrive by ${s.arrive_by}` : null, s.notes],
          };
  const [row] = await tx.query<{ id: string }>(
    `insert into announcements (topic, title, body, audience, requires_ack, urgent, posted_by, squad_session_id)
     values ($1, $2, $3, $4::text[]::age_group[], true, true, $5, $6) returning id`,
    [
      s.kind === "training" ? "Training" : "Matches",
      notice.title.slice(0, 120),
      notice.body.filter(Boolean).join("\n\n"),
      s.age_groups,
      staffId,
      s.picked > 0 ? id : null,
    ],
  );
  return row.id;
}
