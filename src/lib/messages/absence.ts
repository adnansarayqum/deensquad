// A reason for not coming that mentions an injury or illness (messaging review, 23 Nov 2026: "broke his arm" sat among
// "Rain is rain" in one list). Shown first with a pill, and never cleared by "mark all as read". A word list, so it
// errs towards flagging: a false flag costs one tap, a missed injury costs more.

const HEALTH =
  /\b(injur\w*|hurt\w*|broke\w*|broken|fractur\w*|sprain\w*|strain\w*|concuss\w*|hospital|a&e|operation|surgery|stitch\w*|glue\w*|cast|crutch\w*|ill|illness|unwell|sick\w*|poorly|fever|temperature|vomit\w*|flu|covid|infection|asthma|allerg\w*|doctor|gp|dentist|pain\w*|swollen|swelling|bleed\w*|head|knee|ankle|wrist|arm|leg|foot|finger|toe)\b/i;

export function mentionsHealth(text: string | null | undefined): boolean {
  return Boolean(text && HEALTH.test(text));
}
