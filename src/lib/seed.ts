// Demo data for one family (Adnan and his son Yusuf, U9s) plus the U9 squad for the coach screen.
// Dates are built relative to `now` so the demo always shows the coming Friday.
// Names other than the club's real details are invented placeholders.

import { addDays, londonDate, londonTime, nextFridaySession } from "./dates";
import type {
  Announcement,
  Badge,
  Challenge,
  ChecklistItem,
  CoachNote,
  Guardian,
  Player,
  RegisterEntry,
  Session,
} from "./domain";

export const CLUB = {
  name: "The Deen Squad Football Academy",
  shortName: "Deen Squad",
  venue: "Bobby Moore Sports Hub",
  venueAddress: "Dagenham RM9 5PU",
} as const;

export const guardian: Guardian = { id: "g-adnan", firstName: "Adnan", lastName: "S.", language: "en" };

export const player: Player = {
  id: "p-yusuf",
  firstName: "Yusuf",
  lastInitial: "S",
  shirtNumber: 7,
  ageGroup: "U9",
  position: "Midfielder",
  joinedOn: "2026-09-05",
  guardianIds: ["g-adnan"],
};

export function sessions(now: Date): Session[] {
  const friday = nextFridaySession(now);
  const cupDay = londonDate(addDays(friday.start, 15));
  const cupStart = londonTime(cupDay.year, cupDay.month, cupDay.day, 10, 0);
  const cupEnd = londonTime(cupDay.year, cupDay.month, cupDay.day, 15, 0);
  return [
    {
      id: `training-${friday.start.toISOString().slice(0, 10)}`,
      kind: "training",
      title: "Training",
      startsAt: friday.start.toISOString(),
      endsAt: friday.end.toISOString(),
      venue: CLUB.venue,
      ageGroups: ["U7", "U9", "U11", "U13", "U15"],
      briefing: {
        arriveBy: "6:20pm",
        kit: "Green top · shin pads · water bottle",
        weather: "Check the forecast on Thursday night",
        prayer: "Prayer break in the session",
      },
    },
    {
      id: `cup-${cupStart.toISOString().slice(0, 10)}`,
      kind: "tournament",
      title: "Autumn Cup",
      startsAt: cupStart.toISOString(),
      endsAt: cupEnd.toISOString(),
      venue: "Venue to be confirmed",
      ageGroups: ["U9", "U11", "U13"],
    },
  ];
}

export function announcements(now: Date): Announcement[] {
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
  return [
    {
      id: "ann-away-kit",
      topic: "Kit",
      audience: ["U9"],
      title: "New away kit: sizes needed by Friday",
      body: "Please confirm Yusuf's size so we can place the bulk order.",
      postedAt: hoursAgo(3),
      requiresAck: true,
      voiceNote: { durationSec: 42, from: "Coach" },
    },
    {
      id: "ann-winter-timings",
      topic: "Timing",
      audience: "all",
      title: "Winter timings start 7 Nov",
      body: "Sessions stay 6:30–8:00pm. Arrive by 6:20pm and bring a warm layer.",
      postedAt: hoursAgo(74),
      requiresAck: true,
    },
    {
      id: "ann-payments",
      topic: "Payments",
      audience: "all",
      title: "Monthly plan now live on TeamFeePay",
      body: "Every family sets up the monthly plan once. It takes about two minutes.",
      postedAt: hoursAgo(240),
      requiresAck: true,
    },
  ];
}

/** Announcements this family had already acknowledged before the demo starts. */
export const baselineRead = ["ann-winter-timings", "ann-payments"];

export const checklist: ChecklistItem[] = [
  { id: "registered", title: "Registered", detail: "Join the academy", doneDetail: "U9s · joined Sept 2026", actionLabel: "Register", icon: "id" },
  { id: "emergency-contacts", title: "Emergency contacts", detail: "Two people we can call", doneDetail: "2 contacts added", actionLabel: "Add", icon: "phone" },
  { id: "kit-ordered", title: "Training top ordered", detail: "Order from the club shop", doneDetail: "Size 9–10 · collect Friday", actionLabel: "Order", icon: "shirt" },
  { id: "payment-plan", title: "Set up payments", detail: "Two minutes on TeamFeePay", doneDetail: "Monthly plan set up", actionLabel: "Start", icon: "card" },
  { id: "photo-consent", title: "Photo consent", detail: "Can Yusuf be in club photos?", doneDetail: "Answer saved", actionLabel: "Start", icon: "camera" },
];

/** Checklist items this family had already finished before the demo starts. */
export const baselineDone: ChecklistItem["id"][] = ["registered", "emergency-contacts", "kit-ordered"];

export const badges: Badge[] = [
  { id: "first-goal", name: "First goal", icon: "star", earnedOn: "2026-09-19" },
  { id: "on-time-5", name: "On time ×5", icon: "clock", earnedOn: "2026-10-02" },
  { id: "good-adab", name: "Good adab", icon: "trophy", earnedOn: "2026-09-26" },
  { id: "ten-sessions", name: "10 sessions", icon: "target" },
];

export const challenge: Challenge = {
  id: "keepy-uppy",
  name: "Keepy-uppy",
  description: "Juggle the ball 10 times without it dropping, then show Coach on Friday.",
  target: 10,
  progress: 6,
};

export const coachNote: CoachNote = {
  from: "Coach",
  initials: "CH",
  text: "Great passing on Friday, Yusuf. Keep your head up when you receive.",
  writtenOn: "2026-10-02",
};

export const playerStats = { sessions: 11, attendancePct: 92, streakWeeks: 4 };

/** The rest of the U9 squad's answers for this Friday (excludes Yusuf). */
export const squadAnswers = { coming: 16, away: 3, unanswered: 5 };

/** U9 squad for the coach's gate register. Names are invented placeholders. */
export const u9Squad: { player: Pick<Player, "id" | "firstName" | "lastInitial" | "shirtNumber">; entry: Omit<RegisterEntry, "playerId"> }[] = [
  { player: { id: "p-yusuf", firstName: "Yusuf", lastInitial: "S", shirtNumber: 7 }, entry: { status: "checked_in", checkedInAt: "18:26" } },
  { player: { id: "p-ahmed", firstName: "Ahmed", lastInitial: "K", shirtNumber: 11 }, entry: { status: "checked_in", checkedInAt: "18:24", flag: "no_payment_plan" } },
  { player: { id: "p-bilal", firstName: "Bilal", lastInitial: "R", shirtNumber: 4 }, entry: { status: "checked_in", checkedInAt: "18:21" } },
  { player: { id: "p-hamza", firstName: "Hamza", lastInitial: "T", shirtNumber: 9 }, entry: { status: "checked_in", checkedInAt: "18:22" } },
  { player: { id: "p-musa", firstName: "Musa", lastInitial: "D", shirtNumber: 3 }, entry: { status: "checked_in", checkedInAt: "18:19" } },
  { player: { id: "p-idris", firstName: "Idris", lastInitial: "H", shirtNumber: 5 }, entry: { status: "checked_in", checkedInAt: "18:23" } },
  { player: { id: "p-yahya", firstName: "Yahya", lastInitial: "B", shirtNumber: 8 }, entry: { status: "checked_in", checkedInAt: "18:25" } },
  { player: { id: "p-ismail", firstName: "Ismail", lastInitial: "N", shirtNumber: 2 }, entry: { status: "checked_in", checkedInAt: "18:18" } },
  { player: { id: "p-ayaan", firstName: "Ayaan", lastInitial: "P", shirtNumber: 10 }, entry: { status: "checked_in", checkedInAt: "18:20" } },
  { player: { id: "p-zakariya", firstName: "Zakariya", lastInitial: "O", shirtNumber: 6 }, entry: { status: "checked_in", checkedInAt: "18:24" } },
  { player: { id: "p-harun", firstName: "Harun", lastInitial: "Q", shirtNumber: 14 }, entry: { status: "checked_in", checkedInAt: "18:26" } },
  { player: { id: "p-rayyan", firstName: "Rayyan", lastInitial: "J", shirtNumber: 12 }, entry: { status: "checked_in", checkedInAt: "18:22" } },
  { player: { id: "p-sulaiman", firstName: "Sulaiman", lastInitial: "W", shirtNumber: 15 }, entry: { status: "checked_in", checkedInAt: "18:17" } },
  { player: { id: "p-adam", firstName: "Adam", lastInitial: "F", shirtNumber: 1 }, entry: { status: "checked_in", checkedInAt: "18:16" } },
  { player: { id: "p-ilyas", firstName: "Ilyas", lastInitial: "C", shirtNumber: 13 }, entry: { status: "checked_in", checkedInAt: "18:25" } },
  { player: { id: "p-ibrahim", firstName: "Ibrahim", lastInitial: "M", shirtNumber: 16 }, entry: { status: "expected" } },
  { player: { id: "p-zayd", firstName: "Zayd", lastInitial: "A", shirtNumber: 17 }, entry: { status: "expected" } },
];
