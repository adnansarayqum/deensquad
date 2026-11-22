import { describe, expect, it } from "vitest";
import { eventTile, eventWhen, londonInputValue, nextOccurrence } from "./events";

const at = (iso: string) => new Date(iso);
const weekly = (startsAt: string, endsAt: string | null = null, repeatUntil: string | null = null) => ({
  startsAt: at(startsAt),
  endsAt: endsAt ? at(endsAt) : null,
  weekly: true,
  repeatUntil,
});

describe("when an event next happens", () => {
  it("shows a one-off until it's over, then drops it", () => {
    const e = { startsAt: at("2026-12-12T10:00:00Z"), endsAt: at("2026-12-12T13:00:00Z"), weekly: false, repeatUntil: null };
    expect(nextOccurrence(e, at("2026-12-01T09:00:00Z"))?.start.toISOString()).toBe("2026-12-12T10:00:00.000Z");
    expect(nextOccurrence(e, at("2026-12-12T12:59:00Z"))?.end?.toISOString()).toBe("2026-12-12T13:00:00.000Z");
    expect(nextOccurrence(e, at("2026-12-12T13:00:00Z"))).toBeNull();
    // With no finish time it's taken to last two hours.
    expect(nextOccurrence({ ...e, endsAt: null }, at("2026-12-12T11:59:00Z"))).not.toBeNull();
    expect(nextOccurrence({ ...e, endsAt: null }, at("2026-12-12T12:00:00Z"))).toBeNull();
  });

  it("moves a weekly event on to the same weekday and time each week", () => {
    const e = weekly("2026-11-26T20:00:00Z", "2026-11-26T21:00:00Z"); // a Thursday, 8pm to 9pm
    expect(nextOccurrence(e, at("2026-11-20T12:00:00Z"))?.start.toISOString()).toBe("2026-11-26T20:00:00.000Z"); // not before its first date
    expect(nextOccurrence(e, at("2026-11-26T20:30:00Z"))?.start.toISOString()).toBe("2026-11-26T20:00:00.000Z"); // on now
    expect(nextOccurrence(e, at("2026-11-26T21:00:00Z"))?.start.toISOString()).toBe("2026-12-03T20:00:00.000Z");
    expect(nextOccurrence(e, at("2026-12-03T09:00:00Z"))?.start.toISOString()).toBe("2026-12-03T20:00:00.000Z"); // later today
    expect(nextOccurrence(e, at("2026-12-01T09:00:00Z"))?.end?.toISOString()).toBe("2026-12-03T21:00:00.000Z");
  });

  it("keeps the London clock time when the clocks change", () => {
    const e = weekly("2027-03-18T20:00:00Z"); // 8pm in winter
    // After 28 March 2027 London is an hour ahead of UTC, so 8pm is 19:00 UTC.
    expect(nextOccurrence(e, at("2027-03-30T12:00:00Z"))?.start.toISOString()).toBe("2027-04-01T19:00:00.000Z");
  });

  it("stops a weekly event after its last date", () => {
    const e = weekly("2026-11-26T20:00:00Z", null, "2026-12-03");
    expect(nextOccurrence(e, at("2026-12-02T12:00:00Z"))?.start.toISOString()).toBe("2026-12-03T20:00:00.000Z");
    expect(nextOccurrence(e, at("2026-12-04T12:00:00Z"))).toBeNull();
  });
});

describe("how an event's time is said", () => {
  it("names the weekday for a weekly event and the date for a one-off", () => {
    expect(eventWhen(true, at("2026-11-26T20:00:00Z"), at("2026-11-26T21:30:00Z"))).toBe("Every Thursday · 8pm to 9:30pm");
    expect(eventWhen(false, at("2026-12-12T10:00:00Z"), null)).toBe("Sat 12 Dec · 10am");
    expect(eventTile(at("2026-12-12T10:00:00Z"))).toEqual({ top: "SAT", bottom: "12" });
  });

  it("fills a date-and-time box in London time", () => {
    expect(londonInputValue(at("2027-04-01T19:00:00Z"))).toBe("2027-04-01T20:00");
    expect(londonInputValue(null)).toBe("");
  });
});
