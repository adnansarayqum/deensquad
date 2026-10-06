import { CONTRACT } from "../documents/contract";

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
} as const;

export type Need = keyof typeof NEEDS;

/** The To-do steps a parent finishes for each child, in the order the To-do shows them. */
export const TODO_NEEDS = ["contacts", "payment", "contract", "consent"] as const satisfies readonly Need[];

export function isNeed(value: unknown): value is Need {
  return typeof value === "string" && Object.hasOwn(NEEDS, value);
}
