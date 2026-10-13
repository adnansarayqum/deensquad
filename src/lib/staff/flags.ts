// What a child's register flags say: short words for the pill on their row, and one line for the gate
// summary ("4 children need a word (2 no payment plan, 1 unread news, 1 kit ready)"). Pure, shared by the
// register and its tests.

import type { PaymentState } from "../domain";

export type RegisterFlag = "no_payment_plan" | "payment_overdue" | "missing_consent" | "unread_news" | "kit_ready";

const ORDER: RegisterFlag[] = ["no_payment_plan", "payment_overdue", "missing_consent", "unread_news", "kit_ready"];

/** The pill on a child's row. */
export const FLAG_WORDS: Record<RegisterFlag, string> = {
  no_payment_plan: "No payment plan",
  payment_overdue: "Payment overdue",
  missing_consent: "No photo consent",
  unread_news: "Unread news",
  kit_ready: "Kit ready",
};

/** "4 children need a word (2 no payment plan, 1 unread news, 1 kit ready)", or null when nobody does. */
export function flagSummary(rows: readonly { flags: readonly RegisterFlag[] }[]): string | null {
  const flagged = rows.filter((r) => r.flags.length > 0);
  if (flagged.length === 0) return null;
  const parts = ORDER.map((f) => [f, flagged.filter((r) => r.flags.includes(f)).length] as const)
    .filter(([, n]) => n > 0)
    .map(([f, n]) => `${n} ${FLAG_WORDS[f].toLowerCase()}`);
  const who = flagged.length === 1 ? "1 child needs a word" : `${flagged.length} children need a word`;
  return `${who} (${parts.join(", ")})`;
}

/** The payment flag for a child's state: no plan yet, or behind on the monthly plan; none otherwise. */
export function paymentFlags(state: PaymentState): RegisterFlag[] {
  return state === "missing" ? ["no_payment_plan"] : state === "overdue" ? ["payment_overdue"] : [];
}

/**
 * How a child's family pays, for a quiet pill at the gate (not a flag: nothing to chase): the monthly plan (active, or
 * set up and waiting for the club to confirm) or pay as you go, so whoever's on the gate knows to take the session
 * fee. Null when there's no plan, which the flags already say.
 */
export type PayingBy = "monthly" | "pay_as_you_go" | null;

export function payingBy(state: PaymentState): PayingBy {
  return state === "active" || state === "self_reported" ? "monthly" : state === "pay_as_you_go" ? "pay_as_you_go" : null;
}

export const PAYING_WORDS: Record<Exclude<PayingBy, null>, string> = { monthly: "Monthly plan", pay_as_you_go: "Pay as you go" };
