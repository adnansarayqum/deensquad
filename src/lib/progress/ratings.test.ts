import { describe, expect, it } from "vitest";
import { CENTRE, INNER, OUTER, labelPlacement, pointAt, radiusFor, vertices } from "./pentagon";
import { categoryLine, monthsBefore, pickMonth, ratedLine, readScores, reportMonths, summariseRatings, summaryLabel, type RatingRow } from "./ratings";

const row = (ratedOn: string, n: number, by = "Coach Hamza"): RatingRow => ({
  ratedOn,
  by,
  technique: n,
  game_understanding: n,
  physical: n,
  attitude: n,
  teamwork: n,
});

describe("pentagon geometry", () => {
  it("puts the first axis straight up and the rest clockwise", () => {
    expect(pointAt(0, OUTER)).toEqual({ x: CENTRE.x, y: CENTRE.y - OUTER });
    const second = pointAt(1, OUTER);
    expect(second.x).toBeGreaterThan(CENTRE.x);
    expect(second.y).toBeLessThan(CENTRE.y);
    const third = pointAt(2, OUTER);
    expect(third.x).toBeGreaterThan(CENTRE.x);
    expect(third.y).toBeGreaterThan(CENTRE.y);
    // The two lower corners mirror each other.
    const fourth = pointAt(3, OUTER);
    expect(fourth.x).toBeCloseTo(2 * CENTRE.x - third.x, 1);
    expect(fourth.y).toBeCloseTo(third.y, 1);
  });

  it("scales 1 to 5 from a small inner ring, so a 1 isn't the centre", () => {
    expect(radiusFor(1)).toBe(INNER);
    expect(INNER).toBeGreaterThan(0);
    expect(radiusFor(5)).toBe(OUTER);
    expect(radiusFor(3)).toBe((INNER + OUTER) / 2);
    expect(radiusFor(0)).toBe(INNER);
    expect(radiusFor(9)).toBe(OUTER);
    const ones = vertices([1, 1, 1, 1, 1]);
    for (const p of ones) expect(Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y)).toBeCloseTo(INNER, 1);
  });

  it("anchors labels away from the shape", () => {
    expect(labelPlacement(0)).toMatchObject({ anchor: "middle", grow: "up" });
    expect(labelPlacement(1)).toMatchObject({ anchor: "start", grow: "centre" });
    expect(labelPlacement(2)).toMatchObject({ anchor: "start", grow: "down" });
    expect(labelPlacement(3)).toMatchObject({ anchor: "end", grow: "down" });
    expect(labelPlacement(4)).toMatchObject({ anchor: "end", grow: "centre" });
  });
});

describe("averages and trend", () => {
  it("counts months back, keeping to the month's last day", () => {
    expect(monthsBefore("2026-10-12", 3)).toBe("2026-07-12");
    expect(monthsBefore("2026-05-31", 3)).toBe("2026-02-28");
    expect(monthsBefore("2026-02-10", 6)).toBe("2025-08-10");
  });

  it("averages the last 3 months against the 3 before, and says since when", () => {
    const s = summariseRatings(
      [row("2026-10-09", 4), row("2026-09-18", 3, "Coach Bilal"), row("2026-10-02", 5), row("2026-06-01", 2), row("2026-04-20", 1), row("2026-10-20", 1)],
      "2026-10-12",
    );
    expect(s.count).toBe(3);
    expect(s.current?.technique).toBe(4);
    expect(s.previous?.teamwork).toBe(1.5); // 1 June and 20 April (6 months back is 12 April); 20 October is after today
    expect(s.since).toBe("2026-09-18");
    expect(s.last).toEqual({ ratedOn: "2026-10-09", by: "Coach Hamza" });
  });

  it("has no periods without ratings", () => {
    expect(summariseRatings([], "2026-10-12")).toEqual({ current: null, previous: null, count: 0, since: null, last: null });
  });

  it("says each score in words", () => {
    expect(categoryLine("Technique", 3.8, 3.2)).toBe("Technique 3.8 of 5, up from 3.2");
    expect(categoryLine("Teamwork", 3, 3.44)).toBe("Teamwork 3.0 of 5, down from 3.4");
    expect(categoryLine("Physical", 4.04, 3.96)).toBe("Physical 4.0 of 5, the same as before");
    expect(categoryLine("Physical", 4, null)).toBe("Physical 4.0 of 5");
    expect(ratedLine(6, "2026-09-05")).toBe("Rated 6 times since September");
    expect(ratedLine(1, "2026-10-05")).toBe("Rated once, in October");
    expect(ratedLine(0, null)).toBe("Not rated in the last 3 months");
    const fours = { technique: 4, game_understanding: 4, physical: 4, attitude: 4, teamwork: 4 };
    expect(summaryLabel("Yusuf", fours, null)).toBe(
      "Yusuf's ratings, last 3 months: Technique 4.0 of 5; Game understanding 4.0 of 5; Physical 4.0 of 5; Attitude and effort 4.0 of 5; Teamwork 4.0 of 5.",
    );
  });
});

describe("reading a row of scores", () => {
  const form = (values: Record<string, string>) => (name: string) => values[name] ?? null;
  it("tells blank, partial and full rows apart", () => {
    expect(readScores(form({}), "p")).toEqual({ kind: "blank" });
    expect(readScores(form({ "r.p.technique": "4", "r.p.teamwork": "9" }), "p")).toEqual({
      kind: "partial",
      missing: ["Game understanding", "Physical", "Attitude and effort", "Teamwork"],
    });
    expect(
      readScores(form({ "r.p.technique": "1", "r.p.game_understanding": "2", "r.p.physical": "3", "r.p.attitude": "4", "r.p.teamwork": "5" }), "p"),
    ).toEqual({ kind: "full", scores: { technique: 1, game_understanding: 2, physical: 3, attitude: 4, teamwork: 5 } });
  });
});

describe("report months", () => {
  it("offers this month and last, and keeps a choice only among them", () => {
    expect(reportMonths("2026-01-15")).toEqual(["2026-01-01", "2025-12-01"]);
    expect(pickMonth("2025-12", reportMonths("2026-01-15"))).toBe("2025-12-01");
    expect(pickMonth("2025-11", reportMonths("2026-01-15"))).toBe("2026-01-01");
    expect(pickMonth(undefined, reportMonths("2026-01-15"))).toBe("2026-01-01");
  });
});
