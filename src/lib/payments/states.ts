import type { PaymentState } from "../domain";
import type { TfpStatus } from "./teamfeepay";

// How a child's family pays, in one place: the states, what each means, and every way one becomes another. The
// state lives in `payment_status` (one row per child, enum `payment_state`); A CHILD WITH NO ROW IS "missing", which
// is why queries read it as `coalesce(ps.state::text, 'missing')`. (Until 10 Nov 2026 the moves were only readable
// by opening two database functions, an admin action and the TeamFeePay import.)
//
//   missing        no plan yet: flagged at the gate, pays the session fee, counted in the To-do
//   self_reported  the parent says the monthly plan is set up; an admin checks it against TeamFeePay
//   active         monthly plan confirmed by the club
//   overdue        monthly plan behind: flagged at the gate
//   pay_as_you_go  pays each session at the gate; a finished answer, not a gap
//
// Who can move it, and how (each is a function below, checked against the real database in states.test.ts):
//
//   parent "I've set it up"        report_payment_setup()   anything but active → self_reported
//   parent "Pay as you go"         report_pay_as_you_go()   missing → pay_as_you_go, nothing else
//   staff, on the child's page     setPayment               any → active, pay_as_you_go, missing or overdue
//   admin, a TeamFeePay file       applyTeamFeePay          active/overdue as the file says; cancelled → missing,
//                                                           except pay as you go, which stays
//
// The words shown differ on purpose by who's reading (a parent sees "Club checking", an admin "To check"), so the
// labels stay with their screens; the colour meaning is the same everywhere and is here.

/** Every state, in the order a family usually goes through them. The one list to validate input against. */
export const PAYMENT_STATES = ["missing", "self_reported", "active", "overdue", "pay_as_you_go"] as const satisfies readonly PaymentState[];

export const isPaymentState = (value: unknown): value is PaymentState => typeof value === "string" && (PAYMENT_STATES as readonly string[]).includes(value);

/** The states staff can set by hand on the child's page (never self_reported: that's the parent's word). */
export const STAFF_CAN_SET = ["active", "pay_as_you_go", "missing", "overdue"] as const satisfies readonly PaymentState[];

/** The pill's colour for a state, everywhere: done, to check, a settled choice, or needs action. */
export const PAYMENT_TONE: Record<PaymentState, "done" | "gold" | "neutral" | "action"> = {
  active: "done",
  self_reported: "gold",
  pay_as_you_go: "neutral",
  overdue: "action",
  missing: "action",
};

/** A child's state inside a query that has joined `payment_status ps`: no row means missing. */
export const PAYMENT_OF_PS = `coalesce(ps.state::text, 'missing')`;

/** The moves, as pure functions of the state before. The database functions and the import do exactly these. */
export const PAYMENT_MOVES = {
  /** The parent taps "I've set it up": the club still has to check, unless it already confirmed the plan. */
  parentSaysSetUp: (from: PaymentState): PaymentState => (from === "active" ? "active" : "self_reported"),
  /** The parent chooses pay as you go: only from no plan (an overdue plan is the club's to sort out). */
  parentChoosesPayAsYouGo: (from: PaymentState): PaymentState => (from === "missing" ? "pay_as_you_go" : from),
  /** Staff set it after checking TeamFeePay: whatever they chose. */
  staffSets: (_from: PaymentState, to: (typeof STAFF_CAN_SET)[number]): PaymentState => to,
  /**
   * A row of a TeamFeePay file. Active → monthly plan; overdue → overdue; cancelled → no plan, unless the family pays
   * as they go (a cancelled monthly plan doesn't change that) or already had none.
   */
  teamFeePay: (from: PaymentState, status: TfpStatus): PaymentState =>
    status === "active" ? "active" : status === "overdue" ? "overdue" : from === "pay_as_you_go" || from === "missing" ? from : "missing",
} as const;
