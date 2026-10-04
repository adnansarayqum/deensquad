// Pure functions that turn the demo data plus a family's saved taps into exactly what each screen shows.
// The future Supabase data source will return the same shapes.

import type { Announcement, Availability, ChecklistItem, Session } from "./domain";
import type { DemoState } from "./demo-state";
import {
  CLUB,
  announcements,
  badges,
  baselineDone,
  baselineRead,
  challenge,
  checklist,
  coachNote,
  guardian,
  player,
  playerStats,
  sessions,
  squadAnswers,
  u9Squad,
} from "./seed";

export type AnnouncementView = Announcement & { read: boolean };
export type ChecklistItemView = ChecklistItem & { done: boolean };

export type ParentView = ReturnType<typeof buildParentView>;

export function buildParentView(now: Date, state: DemoState) {
  const allSessions = sessions(now);
  const friday = allSessions.find((s) => s.kind === "training") as Session;
  const answer: Availability | undefined = state.availability[friday.id];

  const read = new Set([...baselineRead, ...state.read]);
  const news: AnnouncementView[] = announcements(now)
    .map((a) => ({ ...a, read: !a.requiresAck || read.has(a.id) }))
    .sort((a, b) => Number(a.read) - Number(b.read) || b.postedAt.localeCompare(a.postedAt));

  const done = new Set([...baselineDone, ...state.done]);
  const items: ChecklistItemView[] = checklist.map((c) => ({ ...c, done: done.has(c.id) }));

  return {
    club: CLUB,
    guardian,
    player,
    friday: {
      session: friday,
      answer,
      counts: {
        coming: squadAnswers.coming + (answer === "coming" ? 1 : 0),
        away: squadAnswers.away + (answer === "away" ? 1 : 0),
        unanswered: squadAnswers.unanswered + (answer ? 0 : 1),
      },
    },
    upcoming: allSessions.filter((s) => s.id !== friday.id),
    news,
    unreadCount: news.filter((a) => !a.read).length,
    checklist: {
      items: [...items.filter((i) => !i.done), ...items.filter((i) => i.done)],
      doneCount: items.filter((i) => i.done).length,
      total: items.length,
    },
    photoConsent: state.photoConsent,
    badges,
    challenge,
    coachNote,
    stats: { ...playerStats, badges: badges.filter((b) => b.earnedOn).length },
  };
}

export type RegisterView = ReturnType<typeof buildRegisterView>;

export function buildRegisterView(state: DemoState) {
  const checkedIn = new Set(state.checkedIn);
  const rows = u9Squad.map(({ player: p, entry }) => {
    const markedNow = entry.status === "expected" && checkedIn.has(p.id);
    return {
      ...p,
      status: markedNow ? ("checked_in" as const) : entry.status,
      checkedInAt: markedNow ? "now" : entry.checkedInAt,
      flag: entry.flag,
    };
  });
  const expectedTotal = rows.filter((r) => r.status !== "away").length;
  const here = rows.filter((r) => r.status === "checked_in");
  return {
    ageGroup: "U9" as const,
    expectedTotal,
    hereCount: here.length,
    latest: here.filter((r) => r.id === "p-yusuf"),
    flagged: here.filter((r) => r.flag),
    notHere: rows.filter((r) => r.status === "expected"),
  };
}

/** Ids the Server Actions accept, so a tampered form can't write arbitrary keys into the cookie. */
export function knownIds(now: Date) {
  return {
    announcements: new Set(announcements(now).map((a) => a.id)),
    sessions: new Set(sessions(now).map((s) => s.id)),
    players: new Set(u9Squad.map((r) => r.player.id)),
  };
}
