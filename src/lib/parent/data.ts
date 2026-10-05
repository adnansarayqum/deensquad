import { CONTRACT } from "../documents/contract";
import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup, Announcement, Availability, Badge, Child, CoachNote, PaymentState, Session } from "../domain";

// Queries for the parent screens. They run inside asUser(), so row level security applies,
// but each one also filters to the family's own children and age groups explicitly: a parent
// who is also a coach can read the whole club, and the parent app must still show only their family.

export type Family = { guardian: { id: string; firstName: string }; children: Child[] };

const CHILD_COLUMNS = `p.id, p.first_name, p.last_name, p.shirt_number, p.age_group::text as age_group, p.position,
  p.joined_on::text as joined_on, p.photo_consent`;

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  age_group: AgeGroup;
  position: string | null;
  joined_on: string;
  photo_consent: boolean | null;
};

const toChild = (r: ChildRow): Child => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  shirtNumber: r.shirt_number,
  ageGroup: r.age_group,
  position: r.position,
  joinedOn: r.joined_on,
  photoConsent: r.photo_consent,
});

export const SESSION_COLUMNS = `s.id, s.kind::text as kind, s.title, s.starts_at, s.ends_at, s.venue, s.age_groups::text[] as age_groups,
  s.arrive_by, s.kit, s.prayer_note, s.cancelled_at is not null as cancelled`;

export type SessionRow = {
  id: string;
  kind: Session["kind"];
  title: string;
  starts_at: Date;
  ends_at: Date;
  venue: string;
  age_groups: AgeGroup[];
  arrive_by: string | null;
  kit: string | null;
  prayer_note: string | null;
  cancelled: boolean;
};

export const toSession = (r: SessionRow): Session => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  venue: r.venue,
  ageGroups: r.age_groups,
  arriveBy: r.arrive_by,
  kit: r.kit,
  prayerNote: r.prayer_note,
  cancelled: r.cancelled,
});

export function familyGroups(family: Family): AgeGroup[] {
  return [...new Set(family.children.map((c) => c.ageGroup))];
}

export async function loadFamily(tx: Queryable): Promise<Family | null> {
  const [g] = await tx.query<{ id: string; first_name: string }>(`select id, first_name from guardians where auth_user_id = auth.uid()`);
  if (!g) return null;
  const rows = await tx.query<ChildRow>(
    `select ${CHILD_COLUMNS} from players p where p.id in (select my_player_ids()) order by p.date_of_birth nulls last, p.first_name`,
  );
  return { guardian: { id: g.id, firstName: g.first_name }, children: rows.map(toChild) };
}

export type AnnouncementView = Announcement & { read: boolean };

/**
 * Messages for this family, given its age groups and children as parameters: a squad message only when
 * one of the children is in that squad, any other when it's for everyone or one of the groups.
 */
const familyNews = (groups: string, childIds: string) => `(case when a.squad_session_id is not null
  then exists (select 1 from session_squads q where q.session_id = a.squad_session_id and q.player_id = any (${childIds}::uuid[]))
  else a.audience is null or a.audience && ${groups}::text[]::age_group[] end)`;

export async function loadNews(tx: Queryable, family: Family, limit = 50): Promise<AnnouncementView[]> {
  const rows = await tx.query<{
    id: string;
    topic: string;
    title: string;
    body: string;
    audience: AgeGroup[] | null;
    requires_ack: boolean;
    posted_at: Date;
    posted_by: string | null;
    read: boolean;
  }>(
    `select a.id, a.topic, a.title, a.body, a.audience::text[] as audience, a.requires_ack, a.posted_at, sn.display_name as posted_by,
       exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.guardian_id = $1) as read
     from announcements a
     left join staff_names sn on sn.id = a.posted_by
     where ${familyNews("$2", "$4")}
     order by a.posted_at desc
     limit $3`,
    [family.guardian.id, familyGroups(family), limit, family.children.map((c) => c.id)],
  );
  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    title: r.title,
    body: r.body,
    audience: r.audience ?? "all",
    requiresAck: r.requires_ack,
    postedAt: iso(r.posted_at),
    postedBy: r.posted_by,
    read: !r.requires_ack || r.read,
  }));
}

export async function loadUnreadCount(tx: Queryable, family: Family): Promise<number> {
  const [{ n }] = await tx.query<{ n: number }>(
    `select count(*)::int as n from announcements a
     where a.requires_ack
       and ${familyNews("$2", "$3")}
       and not exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.guardian_id = $1)`,
    [family.guardian.id, familyGroups(family), family.children.map((c) => c.id)],
  );
  return n;
}

/**
 * Sessions that haven't finished yet for the family, cancelled ones included: those for any of their age
 * groups, except squad sessions, which come only when one of their children is picked (with `squad` set).
 */
export async function loadUpcomingSessions(tx: Queryable, children: Child[], now: Date, limit = 20): Promise<Session[]> {
  if (children.length === 0) return [];
  const rows = await tx.query<SessionRow & { squad: string[] | null }>(
    `select ${SESSION_COLUMNS},
       case when is_squad_session(s.id) then coalesce(
         (select array_agg(q.player_id::text order by q.player_id) from session_squads q where q.session_id = s.id and q.player_id = any ($3::uuid[])),
         '{}') end as squad
     from sessions s
     where s.ends_at > $1
       and case when is_squad_session(s.id)
         then exists (select 1 from session_squads q where q.session_id = s.id and q.player_id = any ($3::uuid[]))
         else s.age_groups && $2::text[]::age_group[] end
     order by s.starts_at limit $4`,
    [now, [...new Set(children.map((c) => c.ageGroup))], children.map((c) => c.id), limit],
  );
  return rows.map((r) => (r.squad ? { ...toSession(r), squad: r.squad } : toSession(r)));
}

export const answerKey = (sessionId: string, playerId: string) => `${sessionId}:${playerId}`;

export async function loadAnswers(tx: Queryable, sessionIds: string[], childIds: string[]): Promise<Map<string, Availability>> {
  if (sessionIds.length === 0 || childIds.length === 0) return new Map();
  const rows = await tx.query<{ session_id: string; player_id: string; answer: Availability }>(
    `select session_id, player_id, answer::text as answer from availability where session_id = any($1::uuid[]) and player_id = any($2::uuid[])`,
    [sessionIds, childIds],
  );
  return new Map(rows.map((r) => [answerKey(r.session_id, r.player_id), r.answer]));
}

/**
 * A parent's answer for one child and one session. Written only for their own child, for a session that's still
 * to come and not cancelled, and, for a tournament squad session, only when the child is picked. Returns whether
 * it was saved. (The checks are explicit as well as in row level security: a parent who is also staff bypasses it.)
 */
export async function saveAnswer(tx: Queryable, sessionId: string, playerId: string, answer: Availability): Promise<boolean> {
  const rows = await tx.query(
    `insert into availability (session_id, player_id, answer, answered_by, answered_at)
     select s.id, $2, $3::availability_answer, my_guardian_id(), now() from sessions s
     where s.id = $1 and s.ends_at > now() and s.cancelled_at is null and $2::uuid in (select my_player_ids())
       and squad_allows(s.id, $2::uuid)
     on conflict (session_id, player_id) do update
       set answer = excluded.answer, answered_by = excluded.answered_by, answered_at = excluded.answered_at
     returning player_id`,
    [sessionId, playerId, answer],
  );
  return rows.length > 0;
}

export type SquadCounts = { coming: number; away: number; squad: number };

export async function loadSquadCounts(tx: Queryable, sessionId: string, group: AgeGroup): Promise<SquadCounts> {
  const [row] = await tx.query<SquadCounts>(`select coming, away, squad from squad_counts($1, $2::age_group)`, [sessionId, group]);
  return row ?? { coming: 0, away: 0, squad: 0 };
}

export type ChecklistFacts = { contacts: Map<string, number>; payment: Map<string, PaymentState>; agreed?: Set<string> };

export async function loadChecklistFacts(tx: Queryable, childIds: string[]): Promise<ChecklistFacts> {
  if (childIds.length === 0) return { contacts: new Map(), payment: new Map(), agreed: new Set() };
  const [contacts, payment, agreed] = await Promise.all([
    tx.query<{ player_id: string; n: number }>(
      `select player_id, count(*)::int as n from emergency_contacts where player_id = any($1::uuid[]) group by player_id`,
      [childIds],
    ),
    tx.query<{ player_id: string; state: PaymentState }>(
      `select player_id, state::text as state from payment_status where player_id = any($1::uuid[])`,
      [childIds],
    ),
    tx.query<{ player_id: string }>(`select player_id from agreements where player_id = any($1::uuid[]) and document = $2`, [childIds, CONTRACT.id]),
  ]);
  return {
    contacts: new Map(contacts.map((r) => [r.player_id, r.n])),
    payment: new Map(payment.map((r) => [r.player_id, r.state])),
    agreed: new Set(agreed.map((r) => r.player_id)),
  };
}

export type EmergencyContact = { id: string; name: string; phone: string; relationship: string | null };

export async function loadContacts(tx: Queryable, childId: string): Promise<EmergencyContact[]> {
  return tx.query<EmergencyContact>(
    `select id, name, phone, relationship from emergency_contacts where player_id = $1 and player_id in (select my_player_ids()) order by created_at`,
    [childId],
  );
}

export type PlayerFacts = {
  past: { id: string; startsAt: string }[];
  attended: Set<string>;
  badges: Badge[];
  note: CoachNote | null;
};

export async function loadPlayerFacts(tx: Queryable, child: Child, now: Date): Promise<PlayerFacts> {
  const [past, attended, badges, notes] = await Promise.all([
    tx.query<{ id: string; starts_at: Date }>(
      `select s.id, s.starts_at from sessions s
       where s.starts_at < $1 and s.cancelled_at is null and s.starts_at >= $3::date
         and case when is_squad_session(s.id)
           then exists (select 1 from session_squads q where q.session_id = s.id and q.player_id = $4)
           else $2::age_group = any (s.age_groups) end
       order by s.starts_at desc limit 200`,
      [now, child.ageGroup, child.joinedOn, child.id],
    ),
    tx.query<{ session_id: string }>(`select session_id from attendance where player_id = $1`, [child.id]),
    tx.query<{ id: string; name: string; icon: Badge["icon"]; earned_on: string | null }>(
      `select b.id, b.name, b.icon, pb.earned_on::text as earned_on
       from badges b left join player_badges pb on pb.badge_id = b.id and pb.player_id = $1
       order by pb.earned_on nulls last, b.name`,
      [child.id],
    ),
    tx.query<{ body: string; created_at: Date; author: string | null }>(
      `select n.body, n.created_at, sn.display_name as author from coach_notes n left join staff_names sn on sn.id = n.author
       where n.player_id = $1 order by n.created_at desc limit 1`,
      [child.id],
    ),
  ]);
  const note = notes[0];
  const from = note?.author ?? "Coach";
  return {
    past: past.map((s) => ({ id: s.id, startsAt: iso(s.starts_at) })),
    attended: new Set(attended.map((a) => a.session_id)),
    badges: badges.map((b) => ({ id: b.id, name: b.name, icon: b.icon, earnedOn: b.earned_on ?? undefined })),
    note: note
      ? {
          from,
          initials: from
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          text: note.body,
          writtenOn: iso(note.created_at),
        }
      : null,
  };
}
