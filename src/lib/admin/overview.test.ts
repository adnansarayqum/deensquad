import { describe, expect, it } from "vitest";
import type { AgeGroup } from "../domain";
import type { Dashboard, SeasonSession } from "./dashboard";
import { attendanceChart, endLabels, figures, needsYou, newsReadPct, nextSessionSummary, registerHref, seriesRuns, sharedStart, type ChartPoint } from "./overview";

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
    families: { parents: 21, signedIn: 0, invited: 0, notInvited: 21, childrenAwaitingSignIn: 0, todo: { contacts: 20, payment: 20, contract: 21, consent: 20 } },
    payments: { active: 1, self_reported: 0, missing: 20, overdue: 0 },
    shop: { awaitingPayment: 0, toOrder: 0, ordered: 0, ready: 0, orders: 0, monthPence: 0, seasonPence: 0 },
    news: { recent: [], reminders: { app: 0, email: 0, sms: 0, whatsapp: 0, gate: 0 }, behind: 20 },
    deletionRequests: null,
    ...over,
  };
}

const session = (id: string, groups: [AgeGroup, number, number][], forGroups: AgeGroup[] = ["U7", "U10"]): SeasonSession => {
  const checkedIn = groups.reduce((n, g) => n + g[1], 0);
  const expected = groups.reduce((n, g) => n + g[2], 0);
  return {
    id,
    title: "Training",
    startsAt: "2026-09-04T17:30:00.000Z",
    forGroups,
    groups: groups.map(([group, c, e]) => ({ group, checkedIn: c, expected: e, pct: Math.round((c / e) * 100) })),
    checkedIn,
    expected,
    pct: Math.round((checkedIn / expected) * 100),
  };
};

const ADMIN = { canInvite: true };
const COACH = { canInvite: false };

const seasonGroup = (group: AgeGroup, held: number) => ({ group, squad: 10, held, checkedIn: held, expected: held * 10, averagePct: held ? 10 : null });

describe("overview: Needs you", () => {
  it("lists only what's above 0, most pressing first, each linking to the list its count came from", () => {
    const rows = needsYou(dashboard(), NOW, ADMIN);
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
    const rows = needsYou(d, NOW, ADMIN);
    expect(rows.slice(0, 5).map((r) => r.key)).toEqual(["unanswered", "overdue", "check", "shop", "invite"]);
    expect(rows.find((r) => r.key === "missing3")!.text).toBe("child missed their last 3 sessions");
    expect(rows.find((r) => r.key === "shop")!.href).toBe("/admin/shop");
  });

  it("asks about answers only when the session is within 2 days", () => {
    const later = dashboard();
    later.attendance.next = later.attendance.next.map((g) => (g.session ? { ...g, session: { ...g.session, startsAt: NEXT_WEEK } } : g));
    expect(needsYou(later, NOW, ADMIN).map((r) => r.key)).not.toContain("unanswered");
    // On the day it says "today".
    const today = needsYou(dashboard(), new Date("2026-10-09T08:00:00Z"), ADMIN);
    expect(today[0].text).toBe("children haven't answered for today");
  });

  it("leaves invites to admins and counts sign-ins in children, as the lists it opens do", () => {
    const d = dashboard({ families: { ...dashboard().families, invited: 9, childrenAwaitingSignIn: 12 } });
    expect(needsYou(d, NOW, COACH).map((r) => r.key)).not.toContain("invite");
    expect(needsYou(d, NOW, ADMIN).map((r) => r.key)).toContain("invite");
    const signin = needsYou(d, NOW, COACH).find((r) => r.key === "signin")!;
    expect([signin.count, signin.text, signin.href]).toEqual([12, "children whose parent is invited, not signed in", "/admin/families?need=signin"]);
    expect(needsYou(dashboard({ families: { ...dashboard().families, childrenAwaitingSignIn: 1 } }), NOW, ADMIN).find((r) => r.key === "signin")!.text).toBe(
      "child whose parent is invited, not signed in",
    );
  });

  it("is empty when nothing needs doing (no shop for a coach)", () => {
    const d = dashboard({
      attendance: { ...dashboard().attendance, missedLast3: 0, next: [] },
      families: { parents: 2, signedIn: 2, invited: 0, notInvited: 0, childrenAwaitingSignIn: 0, todo: { contacts: 0, payment: 0, contract: 0, consent: 0 } },
      payments: { active: 2, self_reported: 0, missing: 0, overdue: 0 },
      shop: null,
      news: { recent: [], reminders: { app: 0, email: 0, sms: 0, whatsapp: 0, gate: 0 }, behind: 0 },
    });
    expect(needsYou(d, NOW, ADMIN)).toEqual([]);
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

  it("says the time once when every group with a session shares it, even if a group has none coming up", () => {
    const d = dashboard();
    const groups = d.attendance.next.filter((g) => g.squad > 0);
    expect(sharedStart(groups)).toBe(FRIDAY);
    // Girls have children but nothing scheduled: the others' shared time still goes in the heading.
    expect(sharedStart([...groups, { group: "Girls", squad: 3, session: null, coming: 0, away: 0, unanswered: 0 }])).toBe(FRIDAY);
    expect(sharedStart([...groups, { group: "U15", squad: 4, session: { id: "s2", title: "Match", startsAt: NEXT_WEEK }, coming: 0, away: 0, unanswered: 4 }])).toBeNull();
    expect(sharedStart([{ group: "Girls", squad: 3, session: null, coming: 0, away: 0, unanswered: 0 }])).toBeNull();
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

  const pcts = (points: ChartPoint[]) => points.map((p) => (figures(p) ? p.pct : p));

  it("draws one line per group for 2 to 4 groups: no register where the group's wasn't taken, nothing where the session wasn't theirs", () => {
    const d = dashboard();
    d.attendance.sessions = [...sessions, session("c", [["U7", 2, 5]], ["U7"])];
    d.attendance.season = [seasonGroup("U7", 2), seasonGroup("U10", 2), seasonGroup("U12", 0)];
    const chart = attendanceChart(d);
    expect(chart.series.map((s) => [s.label, s.colour, pcts(s.points)])).toEqual([
      ["U7", "var(--chart-1)", ["no-register", 20, 40]],
      ["U10", "var(--chart-2)", [6, 6, null]],
    ]);
  });

  it("joins a line across sessions that weren't the group's and breaks it only at a missed register", () => {
    const xs = [0, 25, 50, 75, 100];
    const at = (pct: number) => ({ pct, checkedIn: pct, expected: 100 });
    // U7 trains on its own days: the U10-only sessions in between don't break its line.
    expect(seriesRuns([at(50), null, at(60), null, at(70)], xs).map((r) => r.map((p) => p.i))).toEqual([[0, 2, 4]]);
    // A session that was theirs with no register taken does.
    expect(seriesRuns([at(50), "no-register", at(60), null, at(70)], xs).map((r) => r.map((p) => p.i))).toEqual([[0], [2, 4]]);
    expect(seriesRuns([at(50), "no-register", at(60), null, at(70)], xs)[1]).toEqual([
      { i: 2, x: 50, y: 40 },
      { i: 4, x: 100, y: 30 },
    ]);
    expect(seriesRuns(["no-register", null], xs)).toEqual([]);
  });

  it("nudges colliding end labels apart, each keeping its own colour, and keeps them inside the plot", () => {
    const line = (key: string, colour: string, pct: number) => ({ key, label: key, colour, points: [{ pct, checkedIn: pct, expected: 100 }] });
    const close = endLabels([line("U7", "a", 4), line("U10", "b", 3), line("U12", "c", 98)], 128, 16);
    expect(close.map((e) => [e.label, e.colour, e.pct])).toEqual([
      ["U12", "c", 98],
      ["U7", "a", 4],
      ["U10", "b", 3],
    ]);
    // 16px apart, and the bottom one no lower than half a label above the plot's foot (8px up from 128).
    expect(close.map((e) => e.top)).toEqual([8, 104, 120]);
    // Labels far enough apart sit at their lines' heights.
    expect(endLabels([line("U7", "a", 50), line("U10", "b", 100)], 128, 16).map((e) => [e.label, e.top])).toEqual([
      ["U10", 8],
      ["U7", 64],
    ]);
    // A series with no figures has no label.
    expect(endLabels([{ key: "U7", label: "U7", colour: "a", points: ["no-register", null] }], 128, 16)).toEqual([]);
  });

  it("draws the club overall for one group or five or more", () => {
    const one = dashboard();
    one.attendance.sessions = sessions;
    one.attendance.season = [seasonGroup("U10", 2)];
    expect(attendanceChart(one).series.map((s) => [s.label, pcts(s.points)])).toEqual([["U10", [6, 10]]]);

    const five = dashboard();
    five.attendance.sessions = sessions;
    five.attendance.season = (["U6", "U7", "U10", "U12", "U15"] as const).map((g) => seasonGroup(g, 1));
    const chart = attendanceChart(five);
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0]).toMatchObject({ label: "All groups", colour: "var(--grass)" });
    expect(chart.series[0].points[1]).toEqual({ pct: 10, checkedIn: 2, expected: 21 });
  });
});
