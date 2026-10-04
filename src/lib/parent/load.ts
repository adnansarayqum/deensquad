import "server-only";

import { cache } from "react";
import { requireParent } from "../auth/session";
import { loadAwards } from "../awards/data";
import { loadPlans, loadPracticeSheets } from "../plans/data";
import { asUser } from "../db";
import type { Child } from "../domain";
import {
  answerKey,
  familyGroups,
  loadAnswers,
  loadChecklistFacts,
  loadContacts,
  loadFamily,
  loadNews,
  loadPlayerFacts,
  loadSquadCounts,
  loadUnreadCount,
  loadUpcomingSessions,
  type Family,
  type SquadCounts,
} from "./data";
import { buildChecklist, buildWeek, computeStats, nextSessionFor, sortNews } from "./views";

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
    const sessions = await loadUpcomingSessions(tx, familyGroups(family), now);
    const firsts = family.children.map((c) => ({ child: c, session: nextSessionFor(c, sessions) }));
    const answers = await loadAnswers(
      tx,
      [...new Set(firsts.flatMap((f) => (f.session ? [f.session.id] : [])))],
      family.children.map((c) => c.id),
    );
    const counts = new Map<string, SquadCounts>();
    for (const { child, session } of firsts) {
      const key = session ? answerKey(session.id, child.ageGroup) : null;
      if (session && key && !counts.has(key)) counts.set(key, await loadSquadCounts(tx, session.id, child.ageGroup));
    }
    return { sessions, week: buildWeek(family.children, sessions, answers, counts) };
  });
}

export async function getNewsPage() {
  const { user, family } = await getFamily();
  const now = new Date();
  const [news, { week }] = await Promise.all([
    family.children.length ? asUser(user.id, (tx) => loadNews(tx, family)) : Promise.resolve([]),
    loadWeek(user.id, family, now),
  ]);
  const stats = family.children.length === 1 ? await getStats(user.id, family.children[0], now) : null;
  return { family, news: sortNews(news), week, streakWeeks: stats?.streakWeeks ?? null };
}

export async function getFridayPage() {
  const { user, family } = await getFamily();
  const { sessions, week } = await loadWeek(user.id, family, new Date());
  const shown = new Set(week.flatMap((w) => (w.session ? [w.session.id] : [])));
  const groups = familyGroups(family);
  const [plans, sheets] = await asUser(user.id, (tx) => Promise.all([loadPlans(tx, [...shown], groups), loadPracticeSheets(tx, groups, 3)]));
  // Only the plan for each child's own group at the session they're going to.
  const wanted = new Set(week.flatMap((w) => (w.session && !w.session.cancelled ? [`${w.session.id}|${w.child.ageGroup}`] : [])));
  return {
    family,
    week,
    upcoming: sessions.filter((s) => !shown.has(s.id)).slice(0, 4),
    plans: plans.filter((p) => wanted.has(`${p.sessionId}|${p.ageGroup}`)),
    latestSheet: sheets[0] ?? null,
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
  const all = groups.flatMap((g) => g.items);
  return { family, groups, done: all.filter((i) => i.done).length, total: all.length };
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
  if (!child) return { family, child: null, stats: null, badges: [], note: null, awards: null };
  const [{ facts, ...stats }, awards] = await Promise.all([getStats(userId, child, new Date()), asUser(userId, (tx) => loadAwards(tx, child.id))]);
  return { family, child, stats, badges: facts.badges, note: facts.note, awards };
}
