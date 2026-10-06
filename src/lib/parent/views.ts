// Pure functions that turn the family's data into exactly what each parent screen shows.

import { clock, daysUntil, londonDate, sameLondonDay } from "../dates";
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
 * "Coming · answered by Sara, Tue 2:02pm", "Not this week · answered by you, today 9:12am". An answer saved
 * without a guardian (or by one no longer linked to the child) shows no name: "Coming · answered Tue 2:02pm".
 */
/** "today 9:12am", "yesterday 5:40pm", "Tue 2:02pm", or "28 Sept 2:02pm" for older answers. */
function answeredWhen(iso: string, now: Date): string {
  const days = -daysUntil(iso, now);
  const day =
    days === 0
      ? "today"
      : days === 1
        ? "yesterday"
        : new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...(days < 7 ? { weekday: "short" } : { day: "numeric", month: "short" }) }).format(
            new Date(iso),
          );
  return `${day} ${clock(iso)}`;
}

export function answeredLine(record: AnswerRecord, viewerGuardianId: string, now: Date, squad = false): string {
  const label = squad ? (record.answer === "coming" ? "Can play" : "Can't play") : record.answer === "coming" ? "Coming" : "Not this week";
  const when = answeredWhen(record.at, now);
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
  /** "Covers Yusuf, Ali and Maryam": a family-wide step names the children it's for. */
  note?: string;
  /** A family-wide step that's done child by child (the contract): each child's own state and link. */
  parts?: { childId: string; name: string; done: boolean; href: string }[];
  /** How many steps this row counts as in the progress (a contract row counts each child). Default 1. */
  steps?: { done: number; total: number };
};

const joined = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(iso));

/** Steps that are done per child: registered, emergency contacts and photo consent. */
export function buildChecklist(child: Child, facts: ChecklistFacts): ChecklistItemView[] {
  const contacts = facts.contacts.get(child.id) ?? 0;
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

/** The family's children whose monthly plan still needs setting up (none yet, or overdue), and those overdue. */
export function paymentNeeds(children: Child[], payment: Map<string, PaymentState>): { needed: Child[]; overdue: Child[] } {
  const state = (c: Child): PaymentState => payment.get(c.id) ?? "missing";
  return {
    needed: children.filter((c) => state(c) === "missing" || state(c) === "overdue"),
    overdue: children.filter((c) => state(c) === "overdue"),
  };
}

/** What the club charges, from CLUB_FEE_TEXT, or an honest "ask". */
export const feeLine = (feeText: string | null) => feeText ?? "Ask the club about fees";

/**
 * Steps for the whole family: the monthly plan (set up once on TeamFeePay, so one step that covers every child
 * whose plan is missing) and the club contract (still agreed child by child, but one row with each child's state).
 */
export function buildFamilyChecklist(children: Child[], facts: ChecklistFacts, feeText: string | null): ChecklistItemView[] {
  if (children.length === 0) return [];
  const { needed, overdue } = paymentNeeds(children, facts.payment);
  const allActive = children.every((c) => facts.payment.get(c.id) === "active");
  const several = children.length > 1;
  const payment: ChecklistItemView = {
    id: "payment-plan",
    title: "Set up payments",
    detail:
      needed.length === 0
        ? allActive
          ? "Monthly plan active"
          : "You've set it up · the club will confirm"
        : overdue.length > 0
          ? `A payment is overdue${several ? ` for ${joinNames(overdue.map((c) => c.firstName))}` : ""}. Check TeamFeePay`
          : feeLine(feeText),
    note: needed.length > 0 && several ? `Covers ${joinNames(needed.map((c) => c.firstName))}` : undefined,
    actionLabel: overdue.length > 0 ? "Check" : "Start",
    icon: "card",
    done: needed.length === 0,
    href: "/checklist/payment",
  };
  if (!facts.agreed) return [payment];
  const agreed = facts.agreed;
  const signed = children.filter((c) => agreed.has(c.id));
  const unsigned = children.filter((c) => !agreed.has(c.id));
  const contract: ChecklistItemView = {
    id: "agreement",
    title: "Club contract",
    detail: several
      ? unsigned.length === 0
        ? `Signed for ${joinNames(children.map((c) => c.firstName))} this season`
        : `Read and agree with each child: ${joinNames(unsigned.map((c) => c.firstName))} still to sign`
      : unsigned.length === 0
        ? "Signed for this season"
        : `Read and agree with ${children[0].firstName}`,
    actionLabel: "Read",
    icon: "contract",
    done: unsigned.length === 0,
    href: `/checklist/agreement?child=${(unsigned[0] ?? children[0]).id}`,
    parts: several
      ? children.map((c) => ({ childId: c.id, name: c.firstName, done: agreed.has(c.id), href: `/checklist/agreement?child=${c.id}` }))
      : undefined,
    steps: { done: signed.length, total: children.length },
  };
  return [payment, contract];
}

/** Steps done and in all, counting a row by its `steps` (the contract counts each child). */
export function countSteps(items: ChecklistItemView[]): { done: number; total: number } {
  return items.reduce(
    (sum, i) => {
      const s = i.steps ?? { done: i.done ? 1 : 0, total: 1 };
      return { done: sum.done + s.done, total: sum.total + s.total };
    },
    { done: 0, total: 0 },
  );
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

/**
 * A Google Maps search for a session's venue, for a "Directions" link; none while the venue isn't known yet
 * ("Venue to be confirmed", "TBC").
 */
export function directionsUrl(venue: string): string | null {
  const place = venue.trim();
  if (!place || /\b(tbc|tba|to be (confirmed|announced))\b/i.test(place)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
