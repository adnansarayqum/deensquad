import { CONTRACT } from "../documents/contract";
import { newsReaches } from "../squads/sql";

// What a child still needs, as SQL conditions on `players p`. The Families filter (?need=) and the
// overview's to-do figures and its to-check, overdue and no-plan payment figures use these, so each
// of those equals the length of the list it links to. (The overview's "parents not invited yet" and "parents
// invited, not signed in" count parents; their invite/signin links list those parents' children, so the numbers can differ.)
//
// The first four are the parent To-do (see buildChecklist and buildFamilyChecklist in src/lib/parent/views.ts; the
// parent sees the payment as one family step, but it's still recorded per child): a step is
// done when there's an emergency contact, a photo answer, a payment plan that's active or reported
// as set up, and this season's contract (CONTRACT.id) agreed.

const contract = `'${CONTRACT.id.replace(/'/g, "''")}'`;
const paymentState = `coalesce((select ps.state::text from payment_status ps where ps.player_id = p.id), 'missing')`;
const parentIn = `exists (select 1 from player_guardians pg join guardians g on g.id = pg.guardian_id where pg.player_id = p.id and g.auth_user_id is not null)`;
const parentInvited = `exists (select 1 from player_guardians pg join guardians g on g.id = pg.guardian_id where pg.player_id = p.id and g.invited_at is not null)`;

/**
 * True when parent `g` hasn't tapped "I've read this" on 2 or more messages that reach them through a child in
 * `within` (a SQL text[] expression: a coach's groups, or every group). Messages posted before the parent was
 * added don't count, as the chase ladder doesn't chase them. The overview's figure and the Families list's
 * "unread" filter both use this, so they agree.
 */
export function behindOnNews(g: string, within: string): string {
  return `((select count(*) from announcements bn
    where bn.requires_ack and bn.posted_at >= ${g}.created_at
      and exists (select 1 from player_guardians bpg join players bp on bp.id = bpg.player_id
                  where bpg.guardian_id = ${g}.id and bp.age_group::text = any (${within}) and ${newsReaches("bn", "bp")})
      and not exists (select 1 from announcement_reads br where br.announcement_id = bn.id and br.guardian_id = ${g}.id)) >= 2)`;
}

/**
 * The database's now(), unless the session setting `app.now` is set. Only tests set it (PGlite can't move its clock),
 * so dated rules can be checked on any day of the year; the app never does.
 */
export const DB_NOW = `coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now())`;

/** 1 August (UTC), the start of the season DB_NOW falls in: the same date as seasonStart(). */
export const SEASON_START_SQL = `make_timestamptz(
    extract(year from ${DB_NOW} at time zone 'UTC')::int - (case when extract(month from ${DB_NOW} at time zone 'UTC') < 8 then 1 else 0 end),
    8, 1, 0, 0, 0, 'UTC')`;

/**
 * The children who've missed their last 3 sessions this season ("missing lately"), as one set-based query.
 * A session counts for a child when it started this season (from 1 August), has finished (DB_NOW), wasn't
 * cancelled, had the child's group's register taken (someone from their group checked in), was for the child (their
 * group's, or, for a squad session, they were picked: session_squads read directly) and came after they joined
 * (players.joined_on, London date; or they were checked in). The latest 3 per child (row_number) all without a check-in
 * means missing; fewer than 3 never does. Worked out once per query, not per child, so the overview, the Families
 * list and the child page share it and agree.
 */
export const MISSED_LAST_3_IDS = `(
  with checkins as materialized (
    -- every check-in at this season's finished, uncancelled sessions: read once (attendance is the big table)
    select ra.session_id, ra.player_id, rp.age_group, rs.starts_at, rs.age_groups
    from sessions rs
    join attendance ra on ra.session_id = rs.id
    join players rp on rp.id = ra.player_id
    where rs.cancelled_at is null and rs.ends_at <= ${DB_NOW} and rs.starts_at >= ${SEASON_START_SQL}
  ),
  registers as (select distinct session_id, age_group, starts_at, age_groups from checkins),
  squads as (select distinct session_id from session_squads),
  counted as (
    select mp.id as player_id, mr.session_id, mine.player_id is not null as here,
      row_number() over (partition by mp.id order by mr.starts_at desc, mr.session_id) as recent
    from registers mr
    join players mp on mp.age_group = mr.age_group
    left join squads sq on sq.session_id = mr.session_id
    left join checkins mine on mine.session_id = mr.session_id and mine.player_id = mp.id
    where (case when sq.session_id is not null
             then exists (select 1 from session_squads pick where pick.session_id = mr.session_id and pick.player_id = mp.id)
             else mp.age_group = any (mr.age_groups) end)
      and (mp.joined_on <= (mr.starts_at at time zone 'Europe/London')::date or mine.player_id is not null)
  )
  select player_id from counted
  where recent <= 3
  group by player_id
  having count(*) = 3 and not bool_or(here)
)`;

/** "Missing lately" as a condition on `players p` (see MISSED_LAST_3_IDS). */
export const MISSED_LAST_3 = `(p.id in ${MISSED_LAST_3_IDS})`;

export const NEEDS = {
  contacts: { label: "No emergency contact", where: `not exists (select 1 from emergency_contacts ec where ec.player_id = p.id)` },
  consent: { label: "No photo answer", where: `p.photo_consent is null` },
  payment: { label: "No payment plan", where: `${paymentState} in ('missing', 'overdue')` },
  contract: { label: "Contract not signed", where: `not exists (select 1 from agreements ag where ag.player_id = p.id and ag.document = ${contract})` },
  invite: { label: "Not invited", where: `not ${parentIn} and not ${parentInvited}` },
  signin: { label: "Invited, not signed in", where: `not ${parentIn} and ${parentInvited}` },
  missing: { label: "No payment plan set up", where: `${paymentState} = 'missing'` },
  overdue: { label: "Payment overdue", where: `${paymentState} = 'overdue'` },
  check: { label: "Payment to check", where: `${paymentState} = 'self_reported'` },
  missing3: { label: "Missed the last 3 sessions", where: MISSED_LAST_3 },
  // Children with a parent who's behind on news (see behindOnNews); `within` is the list's groups.
  unread: {
    label: "Parent hasn't read 2+ messages",
    where: (within: string) =>
      `exists (select 1 from player_guardians upg join guardians ug on ug.id = upg.guardian_id where upg.player_id = p.id and ${behindOnNews("ug", within)})`,
  },
} as const;

/** A need's condition on `players p`. `within` is the SQL text[] of groups the list covers. */
export function needWhere(need: Need, within: string): string {
  const where: string | ((within: string) => string) = NEEDS[need].where;
  return typeof where === "string" ? where : where(within);
}

export type Need = keyof typeof NEEDS;

/** The To-do steps a parent finishes for each child, in the order the To-do shows them. */
export const TODO_NEEDS = ["contacts", "payment", "contract", "consent"] as const satisfies readonly Need[];

export function isNeed(value: unknown): value is Need {
  return typeof value === "string" && Object.hasOwn(NEEDS, value);
}
