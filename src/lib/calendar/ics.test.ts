import { describe, expect, it } from "vitest";
import { londonTime } from "../dates";
import { buildCalendar, escapeText, foldLine, type CalendarSession } from "./ics";

const base: CalendarSession = {
  id: "30000000-0000-4000-8000-000000000001",
  title: "Training",
  startsAt: londonTime(2026, 10, 9, 18, 30),
  endsAt: londonTime(2026, 10, 9, 20, 0),
  venue: "Bobby Moore Sports Hub",
  children: ["Yusuf"],
  arriveBy: null,
  kit: null,
  notes: null,
  cancelled: false,
  cancelReason: null,
};
const now = new Date("2026-10-07T12:00:00Z");

/** Unfolds continuation lines, as a calendar app reads them. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("calendar feed text", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    expect(escapeText("Pitch 2, Hall; back\\door\nBring water\r\nand boots")).toBe("Pitch 2\\, Hall\\; back\\\\door\\nBring water\\nand boots");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const line = `DESCRIPTION:${"é".repeat(60)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const [i, part] of parts.entries()) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(part.startsWith(" ")).toBe(true);
    }
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
    expect(foldLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("writes times in UTC, right on both sides of the clocks going back", () => {
    const winter = { ...base, id: "30000000-0000-4000-8000-000000000002", startsAt: londonTime(2026, 11, 6, 18, 30), endsAt: londonTime(2026, 11, 6, 20, 0) };
    const ics = unfold(buildCalendar([base, winter], now));
    // 6:30pm London is 17:30 UTC in October (BST) and 18:30 UTC in November (GMT).
    expect(ics).toContain("DTSTART:20261009T173000Z");
    expect(ics).toContain("DTEND:20261009T190000Z");
    expect(ics).toContain("DTSTART:20261106T183000Z");
    expect(ics).toContain("DTSTAMP:20261007T120000Z");
  });

  it("names the event with the children's first names and a stable UID, with CRLF line ends", () => {
    const ics = buildCalendar([{ ...base, children: ["Musa", "Yusuf"], kit: "Black shorts, club top", notes: "Bring water" }], now);
    const text = unfold(ics);
    expect(text).toContain("SUMMARY:Training (Musa and Yusuf)");
    expect(text).toContain("UID:30000000-0000-4000-8000-000000000001@thedeensquadfootballacademy.co.uk");
    expect(text).toContain("LOCATION:Bobby Moore Sports Hub");
    expect(text).toContain("DESCRIPTION:Kit: Black shorts\\, club top\\nBring water");
    expect(text).toContain("X-WR-CALNAME:Deen Squad");
    expect(text).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
    expect(text).toContain("STATUS:CONFIRMED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("keeps a cancelled session, marked cancelled with the reason", () => {
    const text = unfold(buildCalendar([{ ...base, cancelled: true, cancelReason: "Pitch flooded" }], now));
    expect(text).toContain("SUMMARY:Cancelled: Training (Yusuf)");
    expect(text).toContain("STATUS:CANCELLED");
    expect(text).toContain("DESCRIPTION:Cancelled: Pitch flooded");
  });
});
