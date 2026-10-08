import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AttendanceChartData, ChartPoint } from "@/lib/admin/overview";
import { AttendanceChart } from "./charts";

// The attendance chart drawn for groups that train on different days: every figure in its table has a mark in the
// chart, however many sessions there are.

const at = (pct: number): ChartPoint => ({ pct, checkedIn: pct, expected: 100 });

function data(n: number, points: (i: number) => [ChartPoint, ChartPoint]): AttendanceChartData {
  const sessions = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: "Training", startsAt: new Date(Date.UTC(2026, 8, 1 + i, 17, 30)).toISOString() }));
  return {
    sessions,
    series: [
      { key: "U7", label: "U7", colour: "var(--chart-1)", points: sessions.map((_, i) => points(i)[0]) },
      { key: "U10", label: "U10", colour: "var(--chart-2)", points: sessions.map((_, i) => points(i)[1]) },
    ],
  };
}

const dots = (html: string, key: string) => html.match(new RegExp(`data-dot="${key}"`, "g"))?.length ?? 0;
const polylines = (html: string) => html.match(/<polyline/g)?.length ?? 0;

describe("AttendanceChart", () => {
  it("joins each group's line across the other group's days, so nothing vanishes past 16 sessions", () => {
    // 20 sessions, U7 and U10 on alternate days.
    const html = renderToStaticMarkup(<AttendanceChart data={data(20, (i) => (i % 2 === 0 ? [at(50 + i), null] : [null, at(40 + i)]))} title="Attendance" />);
    // One unbroken polyline per group, not ten fragments, each ending in a dot.
    expect(polylines(html)).toBe(2);
    expect(dots(html, "U7")).toBe(1);
    expect(dots(html, "U10")).toBe(1);
    // The table marks the other group's day as not theirs, never as a missed register.
    expect(html).not.toContain("No register");
    expect(html.match(/Not this group&#x27;s session/g)).toHaveLength(20);
  });

  it("always draws a figure on its own as a dot, however many sessions there are", () => {
    // U7's register was taken every other session: ten lone figures, each needing a mark of its own.
    const html = renderToStaticMarkup(<AttendanceChart data={data(20, (i) => [i % 2 === 0 ? at(50 + i) : "no-register", at(40)])} title="Attendance" />);
    expect(dots(html, "U7")).toBe(10);
    expect(dots(html, "U10")).toBe(1);
    expect(html.match(/No register/g)).toHaveLength(10);
    // A one-point polyline draws nothing, so lone figures aren't drawn as lines.
    expect(polylines(html)).toBe(1);
  });

  it("breaks a line only at a missed register and labels each line's end in its own colour", () => {
    const html = renderToStaticMarkup(
      <AttendanceChart data={data(20, (i) => [i === 10 ? "no-register" : at(60), i === 5 ? "no-register" : at(30 + i)])} title="Attendance" />,
    );
    expect(polylines(html)).toBe(4);
    expect(html.match(/No register/g)).toHaveLength(2);
    // Past 16 sessions only the ends get dots: one per line.
    expect(dots(html, "U7")).toBe(1);
    expect(dots(html, "U10")).toBe(1);
    // U7 ends at 60%, U10 at 49%: two labels, each with a swatch in its line's colour before its words.
    expect(html).toMatch(/background:var\(--chart-1\)"><\/span>U7 60%/);
    expect(html).toMatch(/background:var\(--chart-2\)"><\/span>U10 49%/);
  });

  it("shows every dot up to 16 sessions", () => {
    const html = renderToStaticMarkup(<AttendanceChart data={data(16, (i) => [at(50), at(40 + i)])} title="Attendance" />);
    expect(dots(html, "U7")).toBe(16);
    expect(dots(html, "U10")).toBe(16);
  });
});
