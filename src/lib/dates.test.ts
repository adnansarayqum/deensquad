import { describe, expect, it } from "vitest";
import { clock, daysUntil, nextFridaySession, postedLabel, shortDay } from "./dates";

describe("nextFridaySession", () => {
  it("finds the coming Friday at 6:30pm London time in summer time (BST)", () => {
    const { start, end } = nextFridaySession(new Date("2026-10-04T17:00:00Z")); // Sunday
    expect(start.toISOString()).toBe("2026-10-09T17:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-09T19:00:00.000Z");
  });

  it("uses GMT after the clocks go back", () => {
    const { start } = nextFridaySession(new Date("2026-11-02T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-06T18:30:00.000Z");
  });

  it("returns today's session on a Friday before it ends", () => {
    const { start } = nextFridaySession(new Date("2026-10-09T18:00:00Z")); // 7pm London, mid-session
    expect(start.toISOString()).toBe("2026-10-09T17:30:00.000Z");
  });

  it("moves to next week once Friday's session has finished", () => {
    const { start } = nextFridaySession(new Date("2026-10-09T19:30:00Z")); // 8:30pm London
    expect(start.toISOString()).toBe("2026-10-16T17:30:00.000Z");
  });
});

describe("labels", () => {
  it("formats days and times for the UK", () => {
    expect(shortDay("2026-10-09T17:30:00Z")).toBe("Fri 9 Oct");
    expect(clock("2026-10-09T17:30:00Z")).toBe("6:30pm");
  });

  it("describes when a post went up", () => {
    const now = new Date("2026-10-04T15:00:00Z");
    expect(postedLabel("2026-10-04T08:12:00Z", now)).toBe("Today 09:12");
    expect(postedLabel("2026-10-03T16:40:00Z", now)).toBe("Yesterday 17:40");
    expect(postedLabel("2026-10-01T16:40:00Z", now)).toBe("Thu 17:40");
    expect(postedLabel("2026-09-20T16:40:00Z", now)).toBe("20 Sept");
  });

  it("counts calendar days in London", () => {
    expect(daysUntil("2026-10-09T17:30:00Z", new Date("2026-10-04T22:30:00Z"))).toBe(5);
  });
});
