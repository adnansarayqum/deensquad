import { describe, expect, it } from "vitest";
import type { Child, Session } from "../domain";
import { buildWeek, computeStats, joinNames, weekSummary } from "./views";

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
  cancelled,
});

describe("the week for a family", () => {
  const kids = [child("a", "Yusuf", "U10"), child("b", "Musa", "U7")];
  it("asks about every child who hasn't answered", () => {
    const week = buildWeek(kids, [session("s", ["U7", "U10"])], new Map(), new Map());
    expect(weekSummary(week)).toBe("Are Yusuf and Musa coming?");
  });
  it("summarises answers", () => {
    const week = buildWeek(kids, [session("s", ["U7", "U10"])], new Map([["s:a", "coming"], ["s:b", "away"]]), new Map());
    expect(weekSummary(week)).toBe("Yusuf coming · Musa away");
  });
  it("gives each child their own group's session", () => {
    const week = buildWeek(kids, [session("u9", ["U10"]), session("u7", ["U7"])], new Map(), new Map());
    expect(week.map((w) => w.session?.id)).toEqual(["u9", "u7"]);
  });
  it("joins names", () => expect(joinNames(["A", "B", "C"])).toBe("A, B and C"));
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
