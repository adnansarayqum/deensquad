import { describe, expect, it } from "vitest";
import type { Child, Session } from "../domain";
import type { AnswerRecord } from "./data";
import { answeredLine, availabilityQuestion, buildWeek, computeStats, joinNames, sessionsToday, squadInvites, weekSummary } from "./views";

const child = (id: string, name: string, group: Child["ageGroup"]): Child => ({
  id,
  firstName: name,
  lastName: "S",
  shirtNumber: null,
  ageGroup: group,
  position: null,
  joinedOn: "2026-09-01",
  photoConsent: null,
});
const session = (id: string, groups: Child["ageGroup"][], cancelled = false): Session => ({
  id,
  kind: "training",
  title: "Training",
  startsAt: "2026-10-09T17:30:00Z",
  endsAt: "2026-10-09T19:00:00Z",
  venue: "Hub",
  ageGroups: groups,
  arriveBy: null,
  kit: null,
  prayerNote: null,
  notes: null,
  cancelled,
  cancelReason: null,
});

describe("the week for a family", () => {
  const kids = [child("a", "Yusuf", "U10"), child("b", "Musa", "U7")];
  it("asks about every child who hasn't answered", () => {
    const week = buildWeek(kids, [session("s", ["U7", "U10"])], new Map(), new Map());
    expect(weekSummary(week)).toBe("Are Yusuf and Musa coming?");
  });
  it("knows which children have a session today (London), on the day only", () => {
    const week = buildWeek(kids, [session("s", ["U10"])], new Map(), new Map());
    expect(sessionsToday(week, new Date("2026-10-09T08:00:00Z")).map((t) => t.child.firstName)).toEqual(["Yusuf"]);
    expect(sessionsToday(week, new Date("2026-10-08T22:59:00Z"))).toEqual([]); // still Thursday in London
    expect(sessionsToday(week, new Date("2026-10-09T23:00:00Z"))).toEqual([]); // Saturday in London
  });
  it("summarises answers", () => {
    const week = buildWeek(kids, [session("s", ["U7", "U10"])], new Map([["s:a", "coming"], ["s:b", "away"]]), new Map());
    expect(weekSummary(week)).toBe("Yusuf coming · Musa away");
  });
  it("gives each child their own group's session", () => {
    const week = buildWeek(kids, [session("u9", ["U10"]), session("u7", ["U7"])], new Map(), new Map());
    expect(week.map((w) => w.session?.id)).toEqual(["u9", "u7"]);
  });
  it("skips a cancelled session to the next one and lists the cancellation beside it", () => {
    const later = { ...session("next", ["U10", "U7"]), startsAt: "2026-10-16T17:30:00Z", endsAt: "2026-10-16T19:00:00Z" };
    const off = { ...session("off", ["U10", "U7"], true), cancelReason: "Pitch waterlogged" };
    const week = buildWeek(kids, [off, later], new Map([["next:a", "coming"]]), new Map());
    expect(week.map((w) => [w.session?.id, w.cancelled.map((s) => s.id)])).toEqual([
      ["next", ["off"]],
      ["next", ["off"]],
    ]);
    expect(week[0].answer).toBe("coming");
    expect(weekSummary(week)).toBe("Is Musa coming?");
  });
  it("still lists a cancellation when there's no later session", () => {
    const week = buildWeek(kids.slice(0, 1), [session("off", ["U10"], true)], new Map(), new Map());
    expect(week[0].session).toBeUndefined();
    expect(week[0].cancelled.map((s) => s.id)).toEqual(["off"]);
  });
  it("joins names", () => expect(joinNames(["A", "B", "C"])).toBe("A, B and C"));
});

describe("checked in today", () => {
  const kids = [child("a", "Yusuf", "U10"), child("b", "Musa", "U7")];
  it("marks a checked-in child as here, whatever was answered, and stops asking about them", () => {
    const week = buildWeek(kids, [session("s", ["U7", "U10"])], new Map([["s:a", "away"]]), new Map(), {
      checkIns: new Map([["s:a", "2026-10-09T16:58:00Z"], ["other:b", "2026-10-09T16:00:00Z"]]),
    });
    expect(week.map((w) => w.checkedInAt)).toEqual(["2026-10-09T16:58:00Z", undefined]);
    expect(weekSummary(week)).toBe("Is Musa coming?");
    expect(weekSummary(week.slice(0, 1))).toBe("Yusuf is coming");
  });
});

describe("who answered", () => {
  const kids = [child("a", "Yusuf", "U10")];
  const now = new Date("2026-10-08T12:00:00Z"); // Thursday in London
  const bySara: AnswerRecord = { answer: "away", by: { id: "g-sara", name: "Sara" }, at: "2026-10-06T13:02:00Z" };
  it("carries who gave the answer onto the child's week and squad invites", () => {
    const sessions = [session("fri", ["U10"]), { ...session("cup", ["U10"]), kind: "tournament" as const, startsAt: "2026-10-17T09:00:00Z", squad: ["a"] }];
    const records = new Map<string, AnswerRecord>([["fri:a", bySara], ["cup:a", { ...bySara, answer: "coming" }]]);
    const answers = new Map([...records].map(([k, r]) => [k, r.answer]));
    const week = buildWeek(kids, sessions, answers, new Map(), { records });
    expect(week[0].answered).toBe(bySara);
    expect(squadInvites(week, sessions, answers, records)[0].answered?.answer).toBe("coming");
  });
  it("names the other parent, or says you, with the day and time", () => {
    expect(answeredLine(bySara, "g-adnan", now)).toBe("Not this week · answered by Sara, Tue 14:02");
    expect(answeredLine(bySara, "g-sara", now)).toBe("Not this week · answered by you, Tue 14:02");
    expect(answeredLine({ ...bySara, answer: "coming", at: "2026-10-08T08:12:00Z" }, "g-adnan", now)).toBe("Coming · answered by Sara, today 09:12");
    expect(answeredLine({ ...bySara, answer: "coming" }, "g-adnan", now, true)).toBe("Can play · answered by Sara, Tue 14:02");
  });
  it("shows no name when the answer has no guardian (older answers) or theirs can't be seen", () => {
    expect(answeredLine({ ...bySara, by: null }, "g-adnan", now)).toBe("Not this week · answered Tue 14:02");
    expect(answeredLine({ ...bySara, by: { id: "g-gone", name: null } }, "g-adnan", now)).toBe("Not this week · answered Tue 14:02");
  });
});

describe("tournament squads for a family", () => {
  const kids = [child("a", "Yusuf", "U10"), child("b", "Ahmed", "U10")];
  const cup = (startsAt: string): Session => ({ ...session("cup", ["U10"]), kind: "tournament", title: "Spring Cup", startsAt, squad: ["a"] });
  it("makes a squad session the next one only for the picked child, and asks if they can play", () => {
    const week = buildWeek(kids, [cup("2026-10-08T09:00:00Z"), session("fri", ["U10"])], new Map(), new Map());
    expect(week.map((w) => w.session?.id)).toEqual(["cup", "fri"]);
    expect(weekSummary(week.slice(0, 1))).toBe("Can Yusuf play?");
    expect(availabilityQuestion("Yusuf", week[0].session!, "Thu 8 Oct")).toBe("Can Yusuf play in Spring Cup on Thu 8 Oct?");
    expect(availabilityQuestion("Ahmed", week[1].session!, "Fri 9 Oct")).toBe("Is Ahmed coming? Fri 9 Oct");
    expect(squadInvites(week, [cup("2026-10-08T09:00:00Z"), session("fri", ["U10"])], new Map())).toEqual([]);
  });
  it("asks about a later squad session beside the next training, with the answer already given", () => {
    const sessions = [session("fri", ["U10"]), cup("2026-10-17T09:00:00Z")];
    const week = buildWeek(kids, sessions, new Map(), new Map());
    expect(week.map((w) => w.session?.id)).toEqual(["fri", "fri"]);
    const invites = squadInvites(week, sessions, new Map([["cup:a", "away"]]));
    expect(invites.map((i) => [i.child.firstName, i.session.id, i.answer])).toEqual([["Yusuf", "cup", "away"]]);
    expect(squadInvites(week, [session("fri", ["U10"]), { ...cup("2026-10-17T09:00:00Z"), cancelled: true }], new Map())).toEqual([]);
  });
});

describe("player stats", () => {
  const weeks = ["2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"].map((d, i) => ({ id: `s${i}`, startsAt: `${d}T17:30:00Z` }));
  it("counts the streak back from the latest week", () => {
    expect(computeStats(weeks, new Set(["s0", "s2", "s3"]))).toEqual({ sessions: 3, attendancePct: 75, streakWeeks: 2 });
  });
  it("has no percentage before the first session", () => {
    expect(computeStats([], new Set())).toEqual({ sessions: 0, attendancePct: null, streakWeeks: 0 });
  });
});
