// What a child's register flags say: short words for the pill on their row, and one line for the gate
// summary ("4 children need a word (2 no payment plan, 1 unread news, 1 kit ready)"). Pure, shared by the
// register and its tests.

export type RegisterFlag = "no_payment_plan" | "missing_consent" | "unread_news" | "kit_ready";

const ORDER: RegisterFlag[] = ["no_payment_plan", "missing_consent", "unread_news", "kit_ready"];

/** The pill on a child's row. */
export const FLAG_WORDS: Record<RegisterFlag, string> = {
  no_payment_plan: "No payment plan",
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
