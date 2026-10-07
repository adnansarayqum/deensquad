import { describe, expect, it } from "vitest";
import type { AgeGroup } from "../domain";
import type { Dashboard, SeasonSession } from "./dashboard";
import { attendanceChart, needsYou, newsReadPct, nextSessionSummary, registerHref } from "./overview";

// Wednesday 7 October 2026, mid-morning in London.
const NOW = new Date("2026-10-07T09:00:00Z");
const FRIDAY = "2026-10-09T17:30:00.000Z"; // 6:30pm London
const NEXT_WEEK = "2026-10-16T17:30:00.000Z";

function dashboard(over: Partial<Dashboard> = {}): Dashboard {
  return {
    players: 21,
    attendance: {
      next: [
        { group: "U7", squad: 5, session: { id: "s1", title: "Training", startsAt: FRIDAY }, coming: 0, away: 0, unanswered: 5 },
        { group: "U10", squad: 16, session: { id: "s1", title: "Training", startsAt: FRIDAY }, coming: 11, away: 2, unanswered: 3 },
        { group: "U12", squad: 0, session: null, coming: 0, away: 0, unanswered: 0 },
      ],
      season: [],
      seasonPct: null,
      sessions: [],
      missedLast3: 15,
    },
    families: { parents: 21, signedIn: 0, invited: 0, notInvited: 21, todo: { contacts: 20, payment: 20, contract: 21, consent: 20 } },
    payments: { active: 1, self_reported: 0, missing: 20, overdue: 0 },
    shop: { awaitingPayment: 0, toOrder: 0, ordered: 0, ready: 0, orders: 0, monthPence: 0, seasonPence: 0 },
    news: { recent: [], reminders: { app: 0, email: 0, sms: 0, whatsapp: 0, gate: 0 }, behind: 20 },
    deletionRequests: null,
    ...over,
  };
}

const session = (id: string, groups: [AgeGroup, number, number][]): SeasonSession => {
  const checkedIn = groups.reduce((n, g) => n + g[1], 0);
  const expected = groups.reduce((n, g) => n + g[2], 0);
  return {
    id,
    title: "Training",
    startsAt: "2026-09-04T17:30:00.000Z",
    groups: groups.map(([group, c, e]) => ({ group, checkedIn: c, expected: e, pct: Math.round((c / e) * 100) })),
    checkedIn,
    expected,
    pct: Math.round((checkedIn / expected) * 100),
  };
};

const seasonGroup = (group: AgeGroup, held: number) => ({ group, squad: 10, held, checkedIn: held, expected: held * 10, averagePct: held ? 10 : null });

describe("overview: Needs you", () => {
  it("lists only what's above 0, most pressing first, each linking to the list its count came from", () => {
    const rows = needsYou(dashboard(), NOW);
    expect(rows.map((r) => [r.count, r.text, r.href])).toEqual([
      [8, "children haven't answered for Fri 9 Oct", "/coach?session=s1&group=all"],
      [21, "parents not invited yet", "/admin/families?need=invite"],
      [15, "children missed their last 3 sessions", "/admin/families?need=missing3"],
      [20, "parents behind on news", "/admin/families?need=unread"],
      [20, "children without a payment plan", "/admin/families?need=missing"],
    ]);
  });

  it("puts money and kit ahead of invites, and says one child in the singular", () => {
    const d = dashboard({
      payments: { active: 0, self_reported: 1, missing: 0, overdue: 2 },
      shop: { awaitingPayment: 0, toOrder: 3, ordered: 0, ready: 0, orders: 3, monthPence: 0, seasonPence: 0 },
      attendance: { ...dashboard().attendance, missedLast3: 1 },
    });
    const rows = needsYou(d, NOW);
    expect(rows.slice(0, 5).map((r) => r.key)).toEqual(["unanswered", "overdue", "check", "shop", "invite"]);
    expect(rows.find((r) => r.key === "missing3")!.text).toBe("child missed their last 3 sessions");
    expect(rows.find((r) => r.key === "shop")!.href).toBe("/admin/shop");
  });

  it("asks about answers only when the session is within 2 days", () => {
    const later = dashboard();
    later.attendance.next = later.attendance.next.map((g) => (g.session ? { ...g, session: { ...g.session, startsAt: NEXT_WEEK } } : g));
    expect(needsYou(later, NOW).map((r) => r.key)).not.toContain("unanswered");
    // On the day it says "today".
    const today = needsYou(dashboard(), new Date("2026-10-09T08:00:00Z"));
    expect(today[0].text).toBe("children haven't answered for today");
  });

  it("is empty when nothing needs doing (no shop for a coach)", () => {
    const d = dashboard({
      attendance: { ...dashboard().attendance, missedLast3: 0, next: [] },
      families: { parents: 2, signedIn: 2, invited: 0, notInvited: 0, todo: { contacts: 0, payment: 0, contract: 0, consent: 0 } },
      payments: { active: 2, self_reported: 0, missing: 0, overdue: 0 },
      shop: null,
      news: { recent: [], reminders: { app: 0, email: 0, sms: 0, whatsapp: 0, gate: 0 }, behind: 0 },
    });
    expect(needsYou(d, NOW)).toEqual([]);
  });
});

describe("overview: next session and tiles", () => {
  it("adds up the groups whose next session is on the first session day", () => {
    const d = dashboard();
    d.attendance.next.push({ group: "U15", squad: 4, session: { id: "s2", title: "Match", startsAt: NEXT_WEEK }, coming: 4, away: 0, unanswered: 0 });
    expect(nextSessionSummary(d, NOW)).toMatchObject({ day: "Fri 9 Oct", coming: 11, squad: 21, unanswered: 8, href: "/coach?session=s1&group=all" });
    expect(nextSessionSummary(dashboard({ attendance: { ...dashboard().attendance, next: [] } }), NOW)).toBeNull();
    expect(registerHref("s9", ["U10"])).toBe("/coach?session=s9&group=U10");
  });

  it("works out news read over the messages shown, or null when none ask", () => {
    expect(newsReadPct([])).toBeNull();
    expect(
      newsReadPct([
        { id: "a", title: "A", postedAt: "", read: 0, total: 17 },
        { id: "b", title: "B", postedAt: "", read: 1, total: 21 },
        { id: "c", title: "C", postedAt: "", read: 1, total: 21 },
      ]),
    ).toEqual({ pct: 3, read: 2, total: 59 });
  });
});

describe("overview: attendance chart", () => {
  const sessions = [session("a", [["U10", 1, 16]]), session("b", [["U7", 1, 5], ["U10", 1, 16]])];

  it("draws one line per group for 2 to 4 groups, with a gap where a group's register wasn't taken", () => {
    const d = dashboard();
    d.attendance.sessions = sessions;
    d.attendance.season = [seasonGroup("U7", 1), seasonGroup("U10", 2), seasonGroup("U12", 0)];
    const chart = attendanceChart(d);
    expect(chart.series.map((s) => [s.label, s.colour, s.points.map((p) => p?.pct ?? null)])).toEqual([
      ["U7", "var(--chart-1)", [null, 20]],
      ["U10", "var(--chart-2)", [6, 6]],
    ]);
  });

  it("draws the club overall for one group or five or more", () => {
    const one = dashboard();
    one.attendance.sessions = sessions;
    one.attendance.season = [seasonGroup("U10", 2)];
    expect(attendanceChart(one).series.map((s) => [s.label, s.points.map((p) => p?.pct)])).toEqual([["U10", [6, 10]]]);

    const five = dashboard();
    five.attendance.sessions = sessions;
    five.attendance.season = (["U6", "U7", "U10", "U12", "U15"] as const).map((g) => seasonGroup(g, 1));
    const chart = attendanceChart(five);
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0]).toMatchObject({ label: "All groups", colour: "var(--grass)" });
    expect(chart.series[0].points[1]).toEqual({ pct: 10, checkedIn: 2, expected: 21 });
  });
});
