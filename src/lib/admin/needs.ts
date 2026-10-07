import { CONTRACT } from "../documents/contract";
import { newsReaches, sessionIsFor } from "../squads/sql";

// What a child still needs, as SQL conditions on `players p`. The Families filter (?need=) and the
// overview's to-do figures and its to-check, overdue and no-plan payment figures use these, so each
// of those equals the length of the list it links to. (The overview's Parents bar counts parents;
// its invite/signin links list those parents' children, so the numbers can differ.)
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
 * "Missing lately": the child's last 3 sessions all have no check-in for them. A session counts when it has finished,
 * wasn't cancelled, was for the child (sessionIsFor: their group's, or a squad they were picked for), came after
 * they joined (players.joined_on, London date) and had their group's register taken (someone from the group checked
 * in), the same rules as the squad picker's attendance. Fewer than 3 such sessions is never "missing". Uses the
 * database's now(), so the overview and the Families list agree.
 */
export const MISSED_LAST_3 = `(select count(*) = 3 and count(ma.player_id) = 0
    from (select ms.id from sessions ms
          where ms.cancelled_at is null and ms.ends_at <= now()
            and ${sessionIsFor("ms", "p")}
            and (p.joined_on <= (ms.starts_at at time zone 'Europe/London')::date
                 or exists (select 1 from attendance mj where mj.session_id = ms.id and mj.player_id = p.id))
            and exists (select 1 from attendance mt join players mtp on mtp.id = mt.player_id
                        where mt.session_id = ms.id and mtp.age_group = p.age_group)
          order by ms.starts_at desc limit 3) ml
    left join attendance ma on ma.session_id = ml.id and ma.player_id = p.id)`;

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
