import { CONTRACT } from "../documents/contract";
import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { AGE_GROUPS, type AgeGroup, type PaymentState, type Session, type StaffRole } from "../domain";
import { SESSION_COLUMNS, toSession, type SessionRow } from "../parent/data";
import { newsReaches } from "../squads/sql";
import { NEEDS, type Need } from "./needs";
import { overlaps, within as allWithin } from "./scope";

// Queries for the club admin. They run as a member of staff (row level security on: staff see the club).

export type Overview = {
  players: number;
  guardians: number;
  signedIn: number;
  notInvited: number;
  noPayment: number;
  noConsent: number;
  noContacts: number;
};

export async function loadOverview(tx: Queryable): Promise<Overview> {
  const [row] = await tx.query<Overview>(
    `select
       (select count(*) from players)::int as players,
       (select count(*) from guardians)::int as guardians,
       (select count(*) from guardians where auth_user_id is not null)::int as "signedIn",
       (select count(*) from guardians where auth_user_id is null and invited_at is null and email is not null)::int as "notInvited",
       (select count(*) from family_gaps where payment in ('missing', 'overdue'))::int as "noPayment",
       (select count(*) from family_gaps where not consent_recorded)::int as "noConsent",
       (select count(*) from family_gaps where emergency_contacts = 0)::int as "noContacts"`,
  );
  return row;
}

export type FamilyGuardian = { id: string; name: string; email: string | null; phone: string | null; inApp: boolean; invited: boolean };

export type FamilyRow = {
  id: string;
  firstName: string;
  lastName: string;
  ageGroup: AgeGroup;
  shirtNumber: number | null;
  payment: PaymentState;
  inApp: boolean;
  consent: boolean | null;
  contacts: number;
  agreed: boolean;
  guardians: FamilyGuardian[];
};

/** Escapes a search for use inside an ILIKE pattern (backslash is Postgres's default escape). */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export type FamilyFilter = { group: AgeGroup | null; need: Need | null; search: string | null };

/**
 * The Families list's filter as a condition on `players p`, with its parameters numbered from `$first`.
 * The list, the invite banner's count and the invites themselves all use it, so they always agree.
 */
export function familyWhere(
  { group, need, search }: FamilyFilter,
  within: readonly AgeGroup[],
  first: number,
): { sql: string; params: unknown[] } {
  const [g, w, s] = [first, first + 1, first + 2].map((n) => `$${n}`);
  return {
    sql: `(${g}::text is null or p.age_group::text = ${g}) and p.age_group::text = any (${w}::text[])
       and ${need ? NEEDS[need].where : "true"}
       and (${s}::text is null or p.first_name || ' ' || p.last_name ilike ${s} or exists (
         select 1 from player_guardians spg join guardians sg on sg.id = spg.guardian_id
         where spg.player_id = p.id and sg.first_name || ' ' || sg.last_name ilike ${s}))`,
    params: [group, [...within], search?.trim() ? likePattern(search.trim()) : null],
  };
}

/** Parents with an email who haven't signed in or had an invite, with a child in the filtered list. */
export const UNINVITED = `g.email is not null and g.auth_user_id is null and g.invited_at is null`;

export async function countUninvited(tx: Queryable, filter: FamilyFilter, within: readonly AgeGroup[] = AGE_GROUPS): Promise<number> {
  const where = familyWhere(filter, within, 1);
  const [row] = await tx.query<{ n: number }>(
    `select count(distinct g.id)::int as n from guardians g
     join player_guardians pg on pg.guardian_id = g.id join players p on p.id = pg.player_id
     where ${UNINVITED} and ${where.sql}`,
    where.params,
  );
  return row.n;
}

/**
 * Every family, or one age group's; `within` limits a coach to their own groups. `need` keeps the
 * children still missing that step (see needs.ts) and `search` matches a child's or parent's name.
 */
export async function loadFamilies(
  tx: Queryable,
  group: AgeGroup | null,
  within: readonly AgeGroup[] = AGE_GROUPS,
  { need = null, search = null }: { need?: Need | null; search?: string | null } = {},
): Promise<FamilyRow[]> {
  const where = familyWhere({ group, need, search }, within, 2);
  const rows = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    shirt_number: number | null;
    payment: PaymentState;
    in_app: boolean;
    photo_consent: boolean | null;
    contacts: number;
    agreed: boolean;
    guardians: FamilyGuardian[] | string;
  }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group, p.shirt_number, fg.payment::text as payment, fg.in_app,
       p.photo_consent, fg.emergency_contacts as contacts,
       exists (select 1 from agreements ag where ag.player_id = p.id and ag.document = $1) as agreed,
       coalesce(json_agg(json_build_object(
         'id', g.id, 'name', g.first_name || ' ' || g.last_name, 'email', g.email, 'phone', g.phone,
         'inApp', g.auth_user_id is not null, 'invited', g.invited_at is not null
       ) order by g.first_name) filter (where g.id is not null), '[]') as guardians
     from players p
     join family_gaps fg on fg.player_id = p.id
     left join player_guardians pg on pg.player_id = p.id
     left join guardians g on g.id = pg.guardian_id
     where ${where.sql}
     group by p.id, fg.payment, fg.in_app, fg.emergency_contacts
     order by p.age_group, p.last_name, p.first_name`,
    [CONTRACT.id, ...where.params],
  );
  return rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    ageGroup: r.age_group,
    shirtNumber: r.shirt_number,
    payment: r.payment,
    inApp: r.in_app,
    consent: r.photo_consent,
    contacts: r.contacts,
    agreed: r.agreed,
    guardians: typeof r.guardians === "string" ? (JSON.parse(r.guardians) as FamilyGuardian[]) : r.guardians,
  }));
}

export type ChildDetail = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  ageGroup: AgeGroup;
  shirtNumber: number | null;
  position: string | null;
  joinedOn: string;
  photoConsent: boolean | null;
  payment: PaymentState;
  attended: number;
  guardians: (FamilyGuardian & { firstName: string; lastName: string; otherChildren: string[] })[];
  contacts: { id: string; name: string; phone: string; relationship: string | null }[];
};

export async function loadChild(tx: Queryable, id: string): Promise<ChildDetail | null> {
  const [p] = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    age_group: AgeGroup;
    shirt_number: number | null;
    position: string | null;
    joined_on: string;
    photo_consent: boolean | null;
    payment: PaymentState;
    attended: number;
  }>(
    `select p.id, p.first_name, p.last_name, p.date_of_birth::text as date_of_birth, p.age_group::text as age_group, p.shirt_number,
       p.position, p.joined_on::text as joined_on, p.photo_consent, coalesce(ps.state, 'missing')::text as payment,
       (select count(*) from attendance a where a.player_id = p.id)::int as attended
     from players p left join payment_status ps on ps.player_id = p.id where p.id = $1`,
    [id],
  );
  if (!p) return null;
  const [guardians, contacts] = await Promise.all([
    tx.query<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      in_app: boolean;
      invited: boolean;
      other_children: string[] | null;
    }>(
      `select g.id, g.first_name, g.last_name, g.email, g.phone, g.auth_user_id is not null as in_app, g.invited_at is not null as invited,
         (select array_agg(o.first_name order by o.first_name) from player_guardians og join players o on o.id = og.player_id
          where og.guardian_id = g.id and o.id <> $1) as other_children
       from guardians g join player_guardians pg on pg.guardian_id = g.id where pg.player_id = $1 order by g.first_name`,
      [id],
    ),
    tx.query<{ id: string; name: string; phone: string; relationship: string | null }>(
      `select id, name, phone, relationship from emergency_contacts where player_id = $1 order by created_at`,
      [id],
    ),
  ]);
  return {
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    dateOfBirth: p.date_of_birth,
    ageGroup: p.age_group,
    shirtNumber: p.shirt_number,
    position: p.position,
    joinedOn: p.joined_on,
    photoConsent: p.photo_consent,
    payment: p.payment,
    attended: p.attended,
    guardians: guardians.map((g) => ({
      id: g.id,
      name: `${g.first_name} ${g.last_name}`,
      firstName: g.first_name,
      lastName: g.last_name,
      email: g.email,
      phone: g.phone,
      inApp: g.in_app,
      invited: g.invited,
      otherChildren: g.other_children ?? [],
    })),
    contacts,
  };
}

export type NewsRow = {
  id: string;
  topic: string;
  title: string;
  body: string;
  audience: AgeGroup[] | null;
  requiresAck: boolean;
  postedAt: string;
  postedBy: string | null;
  /** Parents it reaches and how many have read it: for a group coach, only parents with a child in their groups. */
  audienceCount: number;
  readCount: number;
  /** True when the counts are a group coach's own groups only ("Your groups: 1 of 25 read"). */
  groupsOnly: boolean;
  /** A message to a tournament squad: the session it's about (it reaches only the squad's parents). */
  squad: { sessionId: string; title: string } | null;
};

/** `groups` is the SQL parameter holding a group coach's own groups (null: the whole club), which limits the counts. */
const newsColumns = (groups: string) => `a.id, a.topic, a.title, a.body, a.audience::text[] as audience, a.requires_ack, a.posted_at, sn.display_name as posted_by,
  a.squad_session_id, (select ss.title from sessions ss where ss.id = a.squad_session_id) as squad_title,
  (select count(distinct pg.guardian_id)::int from player_guardians pg join players p on p.id = pg.player_id
    where ${newsReaches()} and (${groups}::text[] is null or p.age_group::text = any (${groups}::text[]))) as audience_count,
  -- parents who've read it and still have a child it reaches (a squad message follows the squad as it changes)
  (select count(distinct r.guardian_id)::int from announcement_reads r
    join player_guardians pg on pg.guardian_id = r.guardian_id join players p on p.id = pg.player_id
    where r.announcement_id = a.id and ${newsReaches()} and (${groups}::text[] is null or p.age_group::text = any (${groups}::text[]))) as read_count`;

type NewsDbRow = {
  id: string;
  topic: string;
  title: string;
  body: string;
  audience: AgeGroup[] | null;
  requires_ack: boolean;
  posted_at: Date;
  posted_by: string | null;
  audience_count: number;
  read_count: number;
  squad_session_id: string | null;
  squad_title: string | null;
};

const toNews = (r: NewsDbRow, groups: readonly AgeGroup[] | null): NewsRow => ({
  id: r.id,
  topic: r.topic,
  title: r.title,
  body: r.body,
  audience: r.audience,
  requiresAck: r.requires_ack,
  postedAt: iso(r.posted_at),
  postedBy: r.posted_by,
  audienceCount: r.audience_count,
  readCount: Math.min(r.read_count, r.audience_count),
  groupsOnly: groups !== null,
  squad: r.squad_session_id ? { sessionId: r.squad_session_id, title: r.squad_title ?? "Squad" } : null,
});

/** Recent messages; `groups` (a group coach's own) keeps those whose audience overlaps them (see `overlaps` in scope.ts). */
export async function loadNewsList(tx: Queryable, limit = 50, groups: readonly AgeGroup[] | null = null): Promise<NewsRow[]> {
  const rows = await tx.query<NewsDbRow>(
    `select ${newsColumns("$2")} from announcements a left join staff_names sn on sn.id = a.posted_by
     where $2::text[] is null or a.audience is null or cardinality(a.audience) = 0 or a.audience::text[] && $2::text[]
     order by a.posted_at desc limit $1`,
    [limit, groups ? [...groups] : null],
  );
  return rows.map((r) => toNews(r, groups));
}

export type UnreadGuardian = {
  id: string;
  name: string;
  firstName: string;
  phone: string | null;
  inApp: boolean;
  children: string;
  partnerRead: boolean;
  /** Reminders already sent: app, email, sms, whatsapp (repeats allowed for WhatsApp). */
  chased: string[];
};

/**
 * One message and the parents who haven't read it. `groups` (a group coach's own) hides a message
 * that doesn't reach them and lists only parents with a child in those groups.
 */
export async function loadNewsDetail(
  tx: Queryable,
  id: string,
  groups: readonly AgeGroup[] | null = null,
): Promise<{ news: NewsRow; unread: UnreadGuardian[] } | null> {
  const [row] = await tx.query<NewsDbRow>(
    `select ${newsColumns("$2")} from announcements a left join staff_names sn on sn.id = a.posted_by where a.id = $1`,
    [id, groups ? [...groups] : null],
  );
  if (!row) return null;
  if (groups && !overlaps(row.audience, groups)) return null;
  const unread = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    in_app: boolean;
    children: string;
    partner_read: boolean;
    chased: string[] | null;
  }>(
    `select g.id, g.first_name, g.last_name, g.phone, g.auth_user_id is not null as in_app,
       string_agg(distinct p.first_name, ', ') as children,
       exists (
         select 1 from announcement_reads r
         join player_guardians other on other.guardian_id = r.guardian_id
         where r.announcement_id = $1 and r.guardian_id <> g.id
           and other.player_id in (select player_id from player_guardians where guardian_id = g.id)
       ) as partner_read,
       (select array_agg(c.channel::text order by c.sent_at) from announcement_chases c where c.announcement_id = $1 and c.guardian_id = g.id) as chased
     from guardians g
     join player_guardians pg on pg.guardian_id = g.id
     join players p on p.id = pg.player_id
     join announcements a on a.id = $1
     where ${newsReaches()}
       and ($2::text[] is null or p.age_group::text = any ($2::text[]))
       and not exists (select 1 from announcement_reads r where r.announcement_id = $1 and r.guardian_id = g.id)
     group by g.id
     order by 7, g.last_name, g.first_name`,
    [id, groups ? [...groups] : null],
  );
  return {
    news: toNews(row, groups),
    unread: unread.map((u) => ({
      id: u.id,
      name: `${u.first_name} ${u.last_name}`,
      firstName: u.first_name,
      phone: u.phone,
      inApp: u.in_app,
      children: u.children,
      partnerRead: u.partner_read,
      chased: u.chased ?? [],
    })),
  };
}

/** `picked`: how many children are in its tournament squad (0 = an ordinary session for the whole groups). */
export type AdminSession = Session & { attended: number; coming: number; away: number; picked: number };

const ADMIN_SESSION_COLUMNS = `${SESSION_COLUMNS},
    (select count(*)::int from attendance a where a.session_id = s.id) as attended,
    (select count(*)::int from availability v where v.session_id = s.id and v.answer = 'coming' and squad_allows(s.id, v.player_id)) as coming,
    (select count(*)::int from availability v where v.session_id = s.id and v.answer = 'away' and squad_allows(s.id, v.player_id)) as away,
    (select count(*)::int from session_squads q where q.session_id = s.id) as picked`;
type AdminSessionRow = SessionRow & { attended: number; coming: number; away: number; picked: number };
const toAdminSession = (r: AdminSessionRow): AdminSession => ({ ...toSession(r), attended: r.attended, coming: r.coming, away: r.away, picked: r.picked });

/** One session for its Edit, Cancel or Delete page: null when it isn't there or isn't this member of staff's to change. */
export async function loadAdminSession(tx: Queryable, id: string, mine: readonly AgeGroup[] | null): Promise<AdminSession | null> {
  const [row] = await tx.query<AdminSessionRow>(`select ${ADMIN_SESSION_COLUMNS} from sessions s where s.id = $1`, [id]);
  if (!row || (mine && !allWithin(row.age_groups, mine))) return null;
  return toAdminSession(row);
}

/** Upcoming and recent sessions; `groups` (a group coach's own) keeps those that include one of them. */
export async function loadSessionsAdmin(
  tx: Queryable,
  now: Date,
  groups: readonly AgeGroup[] | null = null,
): Promise<{ upcoming: AdminSession[]; recent: AdminSession[]; lastVenue: string | null }> {
  const cols = ADMIN_SESSION_COLUMNS;
  type Row = AdminSessionRow;
  const map = toAdminSession;
  const mine = `($2::text[] is null or s.age_groups::text[] && $2::text[])`;
  const limit = groups ? [...groups] : null;
  const [upcoming, recent, venue] = await Promise.all([
    tx.query<Row>(`select ${cols} from sessions s where s.ends_at > $1 and ${mine} order by s.starts_at limit 60`, [now, limit]),
    tx.query<Row>(`select ${cols} from sessions s where s.ends_at <= $1 and ${mine} order by s.starts_at desc limit 6`, [now, limit]),
    tx.query<{ venue: string }>(`select venue from sessions order by created_at desc limit 1`),
  ]);
  return { upcoming: upcoming.map(map), recent: recent.map(map), lastVenue: venue[0]?.venue ?? null };
}

export type StaffRow = { id: string; email: string; displayName: string; role: StaffRole; signedIn: boolean; ageGroups: AgeGroup[] };

export async function loadStaff(tx: Queryable): Promise<StaffRow[]> {
  const rows = await tx.query<{ id: string; email: string; display_name: string; role: StaffRole; signed_in: boolean; age_groups: string[] }>(
    `select id, email, display_name, role::text as role, auth_user_id is not null as signed_in, age_groups::text[] as age_groups
     from staff order by role, display_name`,
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    signedIn: r.signed_in,
    ageGroups: AGE_GROUPS.filter((g) => (r.age_groups ?? []).includes(g)),
  }));
}
