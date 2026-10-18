import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { clock, londonTime, shortDay } from "../dates";
import type { AgeGroup } from "../domain";
import { startStaffConversation } from "../messages/data";

// Accidents and incidents (migration 0032 `incidents`; the owner's decision: the parents are always told). A coach
// (their own groups) or an admin logs what happened and what was done. In the same transaction it's sent to the
// child's parents as a message from that member of staff (a conversation addressed to them, so replies come back),
// which notifies the parents as any club message does: app push or email, never the text itself. The record is
// kept as written: nobody can change or delete it (no grants), and it goes with the child if they're removed.

import { INCIDENT_KINDS, type IncidentKind } from "./kinds";
export { INCIDENT_KINDS, INCIDENT_TEXT_MAX, isIncidentKind, type IncidentKind } from "./kinds";

export type IncidentInput = {
  playerId: string;
  sessionId: string | null;
  kind: IncidentKind;
  happenedAt: Date;
  whatHappened: string;
  actionTaken: string;
  staff: { id: string; displayName: string };
};

/** The message the parents get (also what the record says). */
export function incidentMessage(i: { kind: IncidentKind; happenedAt: Date; sessionTitle: string | null; whatHappened: string; actionTaken: string; by: string; firstName: string }): string {
  const when = `${shortDay(i.happenedAt.toISOString())}, ${clock(i.happenedAt.toISOString())}`;
  return [
    `${INCIDENT_KINDS[i.kind]}: ${i.firstName}${i.sessionTitle ? `, at ${i.sessionTitle}` : ""}, ${when}.`,
    "",
    `What happened: ${i.whatHappened}`,
    "",
    `What we did: ${i.actionTaken}`,
    "",
    `Reply here if you have any questions. ${i.by}`,
  ].join("\n");
}

/**
 * Logs an incident as the signed-in member of staff and sends it to the parents. `mine` is a group coach's groups
 * (null for admins and coaches of every group): a child outside them is refused. Returns the record and its thread,
 * or null when the child can't be found for this member of staff.
 */
export async function logIncident(tx: Queryable, input: IncidentInput, mine: readonly AgeGroup[] | null): Promise<{ id: string; conversationId: string } | null> {
  const [child] = await tx.query<{ first_name: string }>(
    `select p.first_name from players p where p.id = $1 and ($2::text[] is null or p.age_group::text = any ($2::text[]))`,
    [input.playerId, mine ? [...mine] : null],
  );
  if (!child) return null;
  const [session] = input.sessionId
    ? await tx.query<{ title: string }>(`select title from sessions where id = $1`, [input.sessionId])
    : [];
  const body = incidentMessage({
    kind: input.kind,
    happenedAt: input.happenedAt,
    sessionTitle: session?.title ?? null,
    whatHappened: input.whatHappened,
    actionTaken: input.actionTaken,
    by: input.staff.displayName,
    firstName: child.first_name,
  });
  const subject = `${INCIDENT_KINDS[input.kind]} report: ${child.first_name}, ${shortDay(input.happenedAt.toISOString())}`;
  const conversationId = await startStaffConversation(tx, { childId: input.playerId, staffId: input.staff.id, subject, body });
  const [row] = await tx.query<{ id: string }>(
    `insert into incidents (player_id, session_id, kind, happened_at, what_happened, action_taken, reported_by, reported_by_name, conversation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [input.playerId, session ? input.sessionId : null, input.kind, input.happenedAt, input.whatHappened, input.actionTaken, input.staff.id, input.staff.displayName, conversationId],
  );
  return { id: row.id, conversationId };
}

export type IncidentRow = {
  id: string;
  playerId: string;
  childName: string;
  ageGroup: AgeGroup;
  kind: IncidentKind;
  happenedAt: string;
  sessionTitle: string | null;
  whatHappened: string;
  actionTaken: string;
  reportedBy: string;
  conversationId: string | null;
};

/** Incidents for staff: one child's (`playerId`), or the latest across this member of staff's groups. */
export async function loadIncidents(tx: Queryable, opts: { playerId?: string; mine: readonly AgeGroup[] | null; limit?: number }): Promise<IncidentRow[]> {
  const rows = await tx.query<{
    id: string;
    player_id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    kind: IncidentKind;
    happened_at: Date;
    title: string | null;
    what_happened: string;
    action_taken: string;
    reported_by_name: string;
    conversation_id: string | null;
  }>(
    `select i.id, i.player_id, p.first_name, p.last_name, p.age_group::text as age_group, i.kind, i.happened_at, s.title,
       i.what_happened, i.action_taken, i.reported_by_name, i.conversation_id
     from incidents i join players p on p.id = i.player_id left join sessions s on s.id = i.session_id
     where ($1::uuid is null or i.player_id = $1) and ($2::text[] is null or p.age_group::text = any ($2::text[])) and is_staff()
     order by i.happened_at desc limit $3`,
    [opts.playerId ?? null, opts.mine ? [...opts.mine] : null, opts.limit ?? 50],
  );
  return rows.map((r) => ({
    id: r.id,
    playerId: r.player_id,
    childName: `${r.first_name} ${r.last_name[0] ?? ""}.`,
    ageGroup: r.age_group,
    kind: r.kind,
    happenedAt: iso(r.happened_at),
    sessionTitle: r.title,
    whatHappened: r.what_happened,
    actionTaken: r.action_taken,
    reportedBy: r.reported_by_name,
    conversationId: r.conversation_id,
  }));
}

/** The children a member of staff can log an incident for (their groups; admins every child), for the form's picker. */
export async function loadIncidentChildren(tx: Queryable, mine: readonly AgeGroup[] | null) {
  return tx.query<{ id: string; first_name: string; last_name: string; age_group: AgeGroup }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group from players p
     where ($1::text[] is null or p.age_group::text = any ($1::text[])) order by p.age_group, p.first_name, p.last_name`,
    [mine ? [...mine] : null],
  );
}

/** "2026-10-23T18:45" (a datetime-local box, London time) → a Date, or null. */
export function readLondonDateTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return londonTime(y, mo, d, h, mi);
}

