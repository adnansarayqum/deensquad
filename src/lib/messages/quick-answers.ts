// Quick answers on club news (migration 0025): a message can ask parents to choose one of 2 to 4 short answers
// (Yes / No / Maybe), one per child. Pure helpers shared by the post form, its action and the screens.

export const QUICK_MIN = 2;
export const QUICK_MAX = 4;
export const QUICK_LENGTH = 30;
/** What the post form's option boxes start with. */
export const QUICK_DEFAULTS = ["Yes", "No", "", ""] as const;

/**
 * The options from the post form: none unless "Ask for a quick answer" is ticked; otherwise the filled boxes,
 * tidied, 2 to 4 of them, each at most 30 characters and all different.
 */
export function parseQuickAnswers(ticked: boolean, values: readonly unknown[]): { answers: string[] | null } | { error: string } {
  if (!ticked) return { answers: null };
  const answers = values.flatMap((v) => (typeof v === "string" && v.replace(/\s+/g, " ").trim() ? [v.replace(/\s+/g, " ").trim()] : []));
  if (answers.length < QUICK_MIN) return { error: "Give at least two answers to choose from, like Yes and No." };
  if (answers.length > QUICK_MAX) return { error: `Give at most ${QUICK_MAX} answers to choose from.` };
  const long = answers.find((a) => a.length > QUICK_LENGTH);
  if (long) return { error: `Keep each answer to ${QUICK_LENGTH} characters. “${long.slice(0, 40)}” is ${long.length}.` };
  if (new Set(answers.map((a) => a.toLowerCase())).size !== answers.length) return { error: "Each answer needs to be different." };
  return { answers };
}

/**
 * The accessible name of a quick-answer button: the visible word, plus the child when the message reaches more than
 * one of the family's children ("Yes for Yusuf"), so a screen reader can tell the rows apart.
 */
export function answerButtonName(answer: string, child: string | null): string {
  return child ? `${answer} for ${child}` : answer;
}

/** "Yes (12): Yusuf S., Musa S." style lines for the news detail: one per option in the message's order, then those with no answer. */
export type AnswerTally = { answer: string; children: string[] }[];

export function tallyAnswers(options: readonly string[], rows: readonly { answer: string | null; name: string }[]): { tally: AnswerTally; none: string[] } {
  const tally = options.map((answer) => ({ answer, children: rows.filter((r) => r.answer === answer).map((r) => r.name) }));
  // An answer no longer among the options can't happen (options are fixed once posted), but would count as none.
  const none = rows.filter((r) => r.answer === null || !options.includes(r.answer)).map((r) => r.name);
  return { tally, none };
}
