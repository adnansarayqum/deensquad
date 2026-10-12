import "server-only";

import { cache } from "react";
import { requireParent } from "../auth/session";
import { loadAwards } from "../awards/data";
import { loadPlans, loadPracticeSheets } from "../plans/data";
import { venuePassView } from "../venue-pass/card";
import { loadMyVenuePass } from "../venue-pass/data";
import { asUser } from "../db";
import type { Queryable } from "../db/types";
import { loadParentConversations, loadParentUnreadMessages } from "../messages/data";
import { londonIsoDate } from "../dates";
import { loadProgress, loadReports } from "../progress/data";
import { progressForParents } from "../settings";
import type { Child, Session } from "../domain";
import {
  answerKey,
  familyGroups,
  loadAnswers,
  loadCheckInsToday,
  loadChecklistFacts,
  loadContacts,
  loadFamily,
  loadNews,
  loadQuickAnswers,
  loadPlayerFacts,
  loadSquadCounts,
  loadUnreadCount,
  loadUpcomingSessions,
  type Family,
  type SquadCounts,
} from "./data";
import { clubFeeText, teamFeePayUrl } from "../config";
import { buildChecklist, buildFamilyChecklist, buildWeek, computeStats, countSteps, nextSessionFor, paymentNeeds, sortNews, squadInvites } from "./views";

// One loader per parent screen. Each checks the session, then reads as that parent (row level security on).

const EMPTY_FAMILY = (guardian: { id: string; firstName: string }): Family => ({ guardian, children: [] });

export const getFamily = cache(async () => {
  const user = await requireParent();
  const family = (await asUser(user.id, loadFamily)) ?? EMPTY_FAMILY(user.guardian);
  return { user, family };
});

/** For the tab bar: unread count and how to label the player tab. */
export const getShell = cache(async () => {
  const { user, family } = await getFamily();
  const unread = family.children.length ? await asUser(user.id, (tx) => loadUnreadCount(tx, family)) : 0;
  return { unread, childNames: family.children.map((c) => c.firstName), isStaff: Boolean(user.staff) };
});

async function loadWeek(userId: string, family: Family, now: Date) {
  return asUser(userId, async (tx) => {
    const sessions = await loadUpcomingSessions(tx, family.children, now);
    const firsts = family.children.map((c) => ({ child: c, session: nextSessionFor(c, sessions) }));
    // Answers for each child's next session and for any squad session they're picked for.
    const records = await loadAnswers(
      tx,
      [...new Set([...firsts.flatMap((f) => (f.session ? [f.session.id] : [])), ...sessions.filter((s) => s.squad).map((s) => s.id)])],
      family.children.map((c) => c.id),
    );
    const answers = new Map([...records].map(([key, r]) => [key, r.answer]));
    const counts = new Map<string, SquadCounts>();
    for (const { child, session } of firsts) {
      const key = session ? answerKey(session.id, child.ageGroup) : null;
      if (session && key && !counts.has(key)) counts.set(key, await loadSquadCounts(tx, session.id, child.ageGroup));
    }
    const checkIns = await loadCheckInsToday(tx, family.children.map((c) => c.id), now);
    const week = buildWeek(family.children, sessions, answers, counts, { records, checkIns });
    return { sessions, week, invites: squadInvites(week, sessions, answers, records) };
  });
}

export async function getNewsPage() {
  const { user, family } = await getFamily();
  const now = new Date();
  const childIds = family.children.map((c) => c.id);
  const [news, { week }, facts, unreadMessages] = await Promise.all([
    family.children.length ? asUser(user.id, (tx) => loadNewsWithAnswers(tx, family)) : Promise.resolve([]),
    loadWeek(user.id, family, now),
    family.children.length ? asUser(user.id, (tx) => loadChecklistFacts(tx, childIds)) : Promise.resolve(null),
    family.children.length ? asUser(user.id, (tx) => loadParentUnreadMessages(tx, childIds)) : Promise.resolve(0),
  ]);
  const stats = family.children.length === 1 ? await getStats(user.id, family.children[0], now) : null;
  return { family, news: sortNews(news), week, streakWeeks: stats?.streakWeeks ?? null, stepsLeft: facts ? stepsLeft(family, facts) : 0, unreadMessages };
}

/** News with the family's quick answers filled in (only messages that ask for one need a look). */
async function loadNewsWithAnswers(tx: Queryable, family: Family) {
  const news = await loadNews(tx, family);
  const asking = news.filter((n) => n.quickAnswers && n.reaches.length).map((n) => n.id);
  const answers = await loadQuickAnswers(tx, asking, family.children.map((c) => c.id), family.guardian.id);
  return news.map((n) => ({ ...n, answers: answers.get(n.id) ?? {} }));
}

/** Messages: the family's conversations with the club, newest first. */
export async function getMessagesPage() {
  const { user, family } = await getFamily();
  const conversations = await asUser(user.id, (tx) => loadParentConversations(tx, family.children.map((c) => c.id)));
  return { family, conversations };
}

/**
 * To-do steps the parent can still do themselves, for the "Finish setting up" card on News (where every sign-in
 * lands). The payment step counts only when there's a link to set it up; otherwise the club tells them how.
 */
function stepsLeft(family: Family, facts: Awaited<ReturnType<typeof loadChecklistFacts>>): number {
  const familyItems = buildFamilyChecklist(family.children, facts, clubFeeText()).filter((i) => i.id !== "payment-plan" || teamFeePayUrl());
  const { done, total } = countSteps([...familyItems, ...family.children.flatMap((c) => buildChecklist(c, facts))]);
  return total - done;
}

export async function getFridayPage() {
  const { user, family } = await getFamily();
  const { sessions, week, invites } = await loadWeek(user.id, family, new Date());
  const cancelled = uniqueById(week.flatMap((w) => w.cancelled));
  const shown = new Set([
    ...week.flatMap((w) => (w.session ? [w.session.id] : [])),
    ...invites.map((i) => i.session.id),
    ...cancelled.map((s) => s.id),
  ]);
  const groups = familyGroups(family);
  const [plans, sheets, venuePass] = await asUser(user.id, (tx) =>
    Promise.all([loadPlans(tx, [...shown], groups), loadPracticeSheets(tx, groups, 3), loadMyVenuePass(tx)]),
  );
  // Only the plan for each child's own group at the session they're going to.
  const wanted = new Set(week.flatMap((w) => (w.session && !w.session.cancelled ? [`${w.session.id}|${w.child.ageGroup}`] : [])));
  return {
    family,
    week,
    /** Cancelled sessions before a child's next one, shown as notices above it. */
    cancelled,
    invites,
    upcoming: sessions.filter((s) => !shown.has(s.id)).slice(0, 4),
    plans: plans.filter((p) => wanted.has(`${p.sessionId}|${p.ageGroup}`)),
    latestSheet: sheets[0] ?? null,
    /** The parent's own sports hub entry code, shown with the children's codes on a session day and kept on the phone. */
    venuePass: await venuePassView(venuePass),
  };
}

function uniqueById(sessions: Session[]): Session[] {
  return [...new Map(sessions.map((s) => [s.id, s])).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The QR code screen: the family, and who has already been checked in today ("Musa was checked in at 5:58pm"). */
export async function getPassPage() {
  const { user, family } = await getFamily();
  const [checkIns, venuePass] = await asUser(user.id, (tx) =>
    Promise.all([loadCheckInsToday(tx, family.children.map((c) => c.id), new Date()), loadMyVenuePass(tx)]),
  );
  const at = new Map<string, string>();
  for (const [key, when] of checkIns) {
    const child = key.split(":")[1];
    if (!at.has(child)) at.set(child, when);
  }
  return {
    user,
    family,
    checkedIn: family.children.flatMap((child) => (at.has(child.id) ? [{ child, at: at.get(child.id)! }] : [])),
    venuePass: await venuePassView(venuePass),
  };
}

export async function getPracticePage() {
  const { user, family } = await getFamily();
  return { family, sheets: await asUser(user.id, (tx) => loadPracticeSheets(tx, familyGroups(family))) };
}

export async function getChecklistPage() {
  const { user, family } = await getFamily();
  const facts = await asUser(user.id, (tx) => loadChecklistFacts(tx, family.children.map((c) => c.id)));
  const groups = family.children.map((child) => ({ child, items: buildChecklist(child, facts) }));
  const familyItems = buildFamilyChecklist(family.children, facts, clubFeeText());
  return { family, groups, familyItems, ...countSteps([...familyItems, ...groups.flatMap((g) => g.items)]) };
}

/** The family's payment step: which children it covers, which are overdue, and those already done. */
export async function getPaymentPage() {
  const { user, family } = await getFamily();
  const facts = await asUser(user.id, (tx) => loadChecklistFacts(tx, family.children.map((c) => c.id)));
  return { family, payment: facts.payment, ...paymentNeeds(family.children, facts.payment) };
}

/** The child named in `?child=`, or the first child. Never someone else's child: the id must be in the family. */
export async function getChild(childParam: unknown): Promise<{ family: Family; child: Child | null; userId: string }> {
  const { user, family } = await getFamily();
  const child = family.children.find((c) => c.id === childParam) ?? family.children[0] ?? null;
  return { family, child, userId: user.id };
}

export async function getContactsPage(childParam: unknown) {
  const { family, child, userId } = await getChild(childParam);
  const contacts = child ? await asUser(userId, (tx) => loadContacts(tx, child.id)) : [];
  return { family, child, contacts };
}

async function getStats(userId: string, child: Child, now: Date) {
  const facts = await asUser(userId, (tx) => loadPlayerFacts(tx, child, now));
  return { ...computeStats(facts.past, facts.attended), facts };
}

export async function getPlayerPage(childParam: unknown) {
  const { family, child, userId } = await getChild(childParam);
  if (!child) return { family, child: null, stats: null, badges: [], note: null, awards: null, progress: null };
  const now = new Date();
  const [{ facts, ...stats }, awards, progress] = await Promise.all([
    getStats(userId, child, now),
    asUser(userId, (tx) => loadAwards(tx, child.id)),
    asUser(userId, (tx) => loadChildProgress(tx, child.id, now)),
  ]);
  return { family, child, stats, badges: facts.badges, note: facts.note, awards, progress };
}

/**
 * The child's ratings and latest published reports, only while an admin has switched progress on for parents (row
 * level security also hides both while it's off). Null when off, or when there's nothing to show yet.
 */
async function loadChildProgress(tx: Queryable, childId: string, now: Date) {
  if (!(await progressForParents(tx))) return null;
  const [summary, reports] = await Promise.all([loadProgress(tx, childId, londonIsoDate(now)), loadReports(tx, childId, { published: true, limit: 2 })]);
  if (!summary.current && reports.length === 0) return null;
  return { summary, latest: reports[0] ?? null, earlier: reports.length > 1 };
}

/** /player/progress: every published report for one child, or null while progress is off for parents. */
export async function getProgressPage(childParam: unknown) {
  const { family, child, userId } = await getChild(childParam);
  if (!child) return null;
  return asUser(userId, async (tx) => ((await progressForParents(tx)) ? { family, child, reports: await loadReports(tx, child.id, { published: true }) } : null));
}
