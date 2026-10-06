// Pure functions that turn the family's data into exactly what each parent screen shows.

import { londonDate, postedLabel, sameLondonDay } from "../dates";
import type { Availability, Child, ChecklistItemId, PaymentState, Session } from "../domain";
import type { AnnouncementView, AnswerRecord, ChecklistFacts, SquadCounts } from "./data";
import { answerKey } from "./data";

/** "Yusuf", "Yusuf and Musa", "Yusuf, Musa and Isa". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Unread first, then newest first. */
export function sortNews(news: AnnouncementView[]): AnnouncementView[] {
  return [...news].sort((a, b) => Number(a.read) - Number(b.read) || b.postedAt.localeCompare(a.postedAt));
}

/** Whether a session is this child's: their group's, or a squad session they're picked for. */
export function sessionIsFor(child: Child, session: Session): boolean {
  return session.squad ? session.squad.includes(child.id) : session.ageGroups.includes(child.ageGroup);
}

/**
 * The first session that hasn't finished for this child and isn't cancelled. A cancelled one never hides the
 * next one: parents can still answer and see its plan (the cancellation shows beside it, see `cancelledBefore`).
 */
export function nextSessionFor(child: Child, sessions: Session[]): Session | undefined {
  return sessions.find((s) => sessionIsFor(child, s) && !s.cancelled);
}

/** This child's cancelled sessions before their next one (all of them if there's no next one). Sessions are in date order. */
export function cancelledBefore(child: Child, sessions: Session[], next: Session | undefined): Session[] {
  return sessions.filter((s) => s.cancelled && sessionIsFor(child, s) && (!next || s.startsAt < next.startsAt));
}

/** "Can Yusuf play in Autumn Cup on Sat 17 Oct?" for a squad session; "Is Yusuf coming?" otherwise. */
export function availabilityQuestion(name: string, session: Session, day: string): string {
  return session.squad ? `Can ${name} play in ${session.title} on ${day}?` : `Is ${name} coming? ${day}`;
}

export type SquadInvite = { child: Child; session: Session; answer: Availability | undefined; answered?: AnswerRecord };

/**
 * Squad sessions further ahead than each child's next session, one per picked child, so the family is asked
 * as soon as the child is picked rather than only once it's the next session. Cancelled ones are left out.
 */
export function squadInvites(
  week: ChildWeek[],
  sessions: Session[],
  answers: Map<string, Availability>,
  records?: Map<string, AnswerRecord>,
): SquadInvite[] {
  return sessions.flatMap((session) =>
    session.squad && !session.cancelled
      ? week
          .filter((w) => session.squad!.includes(w.child.id) && w.session?.id !== session.id)
          .map((w) => {
            const key = answerKey(session.id, w.child.id);
            return { child: w.child, session, answer: answers.get(key), answered: records?.get(key) };
          })
      : [],
  );
}

export type ChildWeek = {
  child: Child;
  /** Their next session that's going ahead. */
  session: Session | undefined;
  /** Their cancelled sessions before it. */
  cancelled: Session[];
  answer: Availability | undefined;
  /** Who gave that answer and when (from `loadAnswers`), when known. */
  answered?: AnswerRecord;
  /** When the child was checked in at that session (it's under way today): Friday says so instead of asking. */
  checkedInAt?: string;
  counts: SquadCounts | undefined;
};

export function buildWeek(
  children: Child[],
  sessions: Session[],
  answers: Map<string, Availability>,
  counts: Map<string, SquadCounts>,
  extra: {
    /** Who gave each answer (`loadAnswers`). */
    records?: Map<string, AnswerRecord>;
    /** When each child was checked in today (`loadCheckInsToday`), keyed like answers. */
    checkIns?: Map<string, string>;
  } = {},
): ChildWeek[] {
  return children.map((child) => {
    const session = nextSessionFor(child, sessions);
    return {
      child,
      session,
      cancelled: cancelledBefore(child, sessions, session),
      answer: session ? answers.get(answerKey(session.id, child.id)) : undefined,
      answered: session ? extra.records?.get(answerKey(session.id, child.id)) : undefined,
      checkedInAt: session ? extra.checkIns?.get(answerKey(session.id, child.id)) : undefined,
      counts: session ? counts.get(answerKey(session.id, child.ageGroup)) : undefined,
    };
  });
}

/**
 * The line under an answer already given, so parents who share a child can see who said what:
 * "Coming · answered by Sara, Tue 14:02", "Not this week · answered by you, today 09:12". An answer saved
 * without a guardian (or by one this parent can no longer see) shows no name: "Coming · answered Tue 14:02".
 */
export function answeredLine(record: AnswerRecord, viewerGuardianId: string, now: Date, squad = false): string {
  const label = squad ? (record.answer === "coming" ? "Can play" : "Can't play") : record.answer === "coming" ? "Coming" : "Not this week";
  const when = postedLabel(record.at, now).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase());
  const who = record.by ? (record.by.id === viewerGuardianId ? "you" : record.by.name) : null;
  return who ? `${label} · answered by ${who}, ${when}` : `${label} · answered ${when}`;
}

/** One line for the news header: "Is Yusuf coming?", "Yusuf is coming", "Are Yusuf and Musa coming?". */
export function weekSummary(week: ChildWeek[]): string {
  // A child already checked in is there, whatever was answered.
  const open = week.filter((w) => w.session && !w.session.cancelled).map((w) => (w.checkedInAt ? { ...w, answer: "coming" as const } : w));
  const unanswered = open.filter((w) => !w.answer).map((w) => w.child.firstName);
  if (unanswered.length === 1) return open.find((w) => !w.answer)?.session?.squad ? `Can ${unanswered[0]} play?` : `Is ${unanswered[0]} coming?`;
  if (unanswered.length > 1) return `Are ${joinNames(unanswered)} coming?`;
  const coming = open.filter((w) => w.answer === "coming").map((w) => w.child.firstName);
  const away = open.filter((w) => w.answer === "away").map((w) => w.child.firstName);
  if (away.length === 0) return `${joinNames(coming)} ${coming.length > 1 ? "are" : "is"} coming`;
  if (coming.length === 0) return `${joinNames(away)} ${away.length > 1 ? "are" : "is"} away`;
  return `${joinNames(coming)} coming · ${joinNames(away)} away`;
}

export type ChecklistItemView = {
  id: ChecklistItemId;
  title: string;
  detail: string;
  actionLabel: string;
  icon: "card" | "camera" | "phone" | "id" | "contract";
  done: boolean;
  href?: string;
};

const joined = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(iso));

export function buildChecklist(child: Child, facts: ChecklistFacts): ChecklistItemView[] {
  const contacts = facts.contacts.get(child.id) ?? 0;
  const payment: PaymentState = facts.payment.get(child.id) ?? "missing";
  const q = `?child=${child.id}`;
  return [
    {
      id: "registered",
      title: "Registered",
      detail: `${child.ageGroup}s · joined ${joined(child.joinedOn)}`,
      actionLabel: "",
      icon: "id",
      done: true,
    },
    {
      id: "emergency-contacts",
      title: "Emergency contacts",
      detail: contacts === 0 ? "Someone we can call if we can't reach you" : `${contacts} contact${contacts === 1 ? "" : "s"} added`,
      actionLabel: "Add",
      icon: "phone",
      done: contacts > 0,
      href: `/checklist/contacts${q}`,
    },
    {
      id: "payment-plan",
      title: "Set up payments",
      detail:
        payment === "active"
          ? "Monthly plan active"
          : payment === "self_reported"
            ? "You've set it up · the club will confirm"
            : payment === "overdue"
              ? "A payment is overdue. Check TeamFeePay"
              : "Two minutes on TeamFeePay",
      actionLabel: payment === "overdue" ? "Check" : "Start",
      icon: "card",
      done: payment === "active" || payment === "self_reported",
      href: `/checklist/payment${q}`,
    },
    ...(facts.agreed
      ? [
          {
            id: "agreement" as const,
            title: "Club contract",
            detail: facts.agreed.has(child.id) ? "Signed for this season" : `Read and agree with ${child.firstName}`,
            actionLabel: "Read",
            icon: "contract" as const,
            done: facts.agreed.has(child.id),
            href: `/checklist/agreement${q}`,
          },
        ]
      : []),
    {
      id: "photo-consent",
      title: "Photo consent",
      detail:
        child.photoConsent === null ? `Can ${child.firstName} be in club photos?` : child.photoConsent ? "Photos are fine" : "No photos, faces blurred",
      actionLabel: "Answer",
      icon: "camera",
      done: child.photoConsent !== null,
      href: `/checklist/consent${q}`,
    },
  ];
}

/** Monday of the London week an instant falls in, as "YYYY-MM-DD". */
function weekOf(iso: string): string {
  const d = londonDate(new Date(iso));
  const day = Date.UTC(d.year, d.month - 1, d.day);
  const monday = new Date(day - ((d.weekday + 6) % 7) * 86400000);
  return monday.toISOString().slice(0, 10);
}

export type PlayerStats = { sessions: number; attendancePct: number | null; streakWeeks: number };

/**
 * Sessions attended, attendance since joining, and the streak: consecutive weeks (most recent first)
 * with at least one session attended, counting only weeks the child's group had a session.
 */
export function computeStats(past: { id: string; startsAt: string }[], attended: Set<string>): PlayerStats {
  const count = past.filter((s) => attended.has(s.id)).length;
  const weeks = new Map<string, boolean>();
  for (const s of past) {
    const key = weekOf(s.startsAt);
    weeks.set(key, (weeks.get(key) ?? false) || attended.has(s.id));
  }
  let streak = 0;
  for (const key of [...weeks.keys()].sort().reverse()) {
    if (!weeks.get(key)) break;
    streak++;
  }
  return { sessions: count, attendancePct: past.length ? Math.round((count / past.length) * 100) : null, streakWeeks: streak };
}

/**
 * The children whose next session is today (London) and going ahead, with it: on that day Friday shows their
 * attendance QR codes and News points to them.
 */
export function sessionsToday(week: ChildWeek[], now: Date): { child: Child; session: Session }[] {
  return week.flatMap((w) => (w.session && !w.session.cancelled && sameLondonDay(new Date(w.session.startsAt), now) ? [{ child: w.child, session: w.session }] : []));
}
