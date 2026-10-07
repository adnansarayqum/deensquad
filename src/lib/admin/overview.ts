import { londonDate, shortDay } from "../dates";
import type { AgeGroup } from "../domain";
import type { Dashboard, NextSessionGroup } from "./dashboard";

// Pure view builders for the admin overview (/admin): what goes on the "Needs you" list, the headline tiles and the
// attendance chart. Every number comes straight from loadDashboard, so each still equals the list it links to.

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** London calendar days from `now` to `iso` (0 = today). */
function daysAhead(iso: string, now: Date): number {
  const a = londonDate(now);
  const b = londonDate(new Date(iso));
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}

/** The register for a session: every group's children together when more than one of its groups is in view. */
export function registerHref(sessionId: string, groups: readonly AgeGroup[]): string {
  return `/coach?${new URLSearchParams({ session: sessionId, group: groups.length === 1 ? groups[0] : "all" })}`;
}

export type NextSessionSummary = {
  /** The earliest upcoming session's start; groups whose next session is on the same London day are counted with it. */
  startsAt: string;
  day: string;
  groups: (NextSessionGroup & { session: NonNullable<NextSessionGroup["session"]> })[];
  coming: number;
  away: number;
  unanswered: number;
  squad: number;
  href: string;
};

/** The next session day for the groups in view (with children), or null when nothing is coming up. */
export function nextSessionSummary(d: Dashboard, now: Date): NextSessionSummary | null {
  const withSession = d.attendance.next.filter((g): g is NextSessionSummary["groups"][number] => g.squad > 0 && g.session !== null);
  if (withSession.length === 0) return null;
  const first = withSession.reduce((a, b) => (a.session.startsAt <= b.session.startsAt ? a : b));
  const day = daysAhead(first.session.startsAt, now);
  const groups = withSession.filter((g) => daysAhead(g.session.startsAt, now) === day);
  const sum = (k: "coming" | "away" | "unanswered" | "squad") => groups.reduce((n, g) => n + g[k], 0);
  const inFirst = groups.filter((g) => g.session.id === first.session.id).map((g) => g.group);
  return {
    startsAt: first.session.startsAt,
    day: day === 0 ? "Today" : day === 1 ? "Tomorrow" : shortDay(first.session.startsAt),
    groups,
    coming: sum("coming"),
    away: sum("away"),
    unanswered: sum("unanswered"),
    squad: sum("squad"),
    href: registerHref(first.session.id, inFirst),
  };
}

export type NeedRow = { key: string; count: number; text: string; href: string };

/**
 * Everything waiting on staff, most pressing first, leaving out anything at 0. The page shows the first 5. A session
 * whose answers are still missing counts only when it's today, tomorrow or the day after.
 */
export function needsYou(d: Dashboard, now: Date): NeedRow[] {
  const f = d.families;
  const next = nextSessionSummary(d, now);
  const soon = next && daysAhead(next.startsAt, now) <= 2 ? next : null;
  const rows: NeedRow[] = [
    {
      key: "unanswered",
      count: soon?.unanswered ?? 0,
      text: `${plural(soon?.unanswered ?? 0, "child hasn't", "children haven't")} answered for ${soon && (soon.day === "Today" || soon.day === "Tomorrow") ? soon.day.toLowerCase() : (soon?.day ?? "")}`,
      href: soon?.href ?? "/coach",
    },
    { key: "overdue", count: d.payments.overdue, text: plural(d.payments.overdue, "payment overdue", "payments overdue"), href: "/admin/families?need=overdue" },
    { key: "check", count: d.payments.self_reported, text: plural(d.payments.self_reported, "payment plan to check", "payment plans to check"), href: "/admin/families?need=check" },
    { key: "shop", count: d.shop?.toOrder ?? 0, text: plural(d.shop?.toOrder ?? 0, "paid kit order to place", "paid kit orders to place"), href: "/admin/shop" },
    { key: "invite", count: f.notInvited, text: plural(f.notInvited, "parent not invited yet", "parents not invited yet"), href: "/admin/families?need=invite" },
    {
      key: "missing3",
      count: d.attendance.missedLast3,
      text: plural(d.attendance.missedLast3, "child missed their last 3 sessions", "children missed their last 3 sessions"),
      href: "/admin/families?need=missing3",
    },
    { key: "unread", count: d.news.behind, text: plural(d.news.behind, "parent behind on news", "parents behind on news"), href: "/admin/families?need=unread" },
    { key: "missing", count: d.payments.missing, text: plural(d.payments.missing, "child without a payment plan", "children without a payment plan"), href: "/admin/families?need=missing" },
    { key: "signin", count: f.invited, text: plural(f.invited, "parent invited, not signed in", "parents invited, not signed in"), href: "/admin/families?need=signin" },
  ];
  return rows.filter((r) => r.count > 0);
}

/** Read ÷ asked over the messages shown on the overview, as a whole percentage; null when none ask to be read. */
export function newsReadPct(recent: Dashboard["news"]["recent"]): { pct: number; read: number; total: number } | null {
  const read = recent.reduce((n, m) => n + m.read, 0);
  const total = recent.reduce((n, m) => n + m.total, 0);
  return total > 0 ? { pct: Math.round((read / total) * 100), read, total } : null;
}

export type ChartPoint = { pct: number; checkedIn: number; expected: number } | null;
export type ChartSeries = { key: string; label: string; colour: string; points: ChartPoint[] };
export type AttendanceChartData = { sessions: { id: string; title: string; startsAt: string }[]; series: ChartSeries[] };

const SERIES_COLOURS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

/**
 * Attendance per session this season. One line per group when 2 to 4 groups have had a register taken (each group
 * keeps its colour by its place among them); otherwise one line for all of them together, in grass.
 */
export function attendanceChart(d: Dashboard): AttendanceChartData {
  const sessions = d.attendance.sessions;
  const groups = d.attendance.season.filter((g) => g.held > 0).map((g) => g.group);
  const base = { sessions: sessions.map(({ id, title, startsAt }) => ({ id, title, startsAt })) };
  if (groups.length >= 2 && groups.length <= 4) {
    return {
      ...base,
      series: groups.map((group, i) => ({
        key: group,
        label: group,
        colour: SERIES_COLOURS[i],
        points: sessions.map((s) => {
          const g = s.groups.find((x) => x.group === group);
          return g ? { pct: g.pct, checkedIn: g.checkedIn, expected: g.expected } : null;
        }),
      })),
    };
  }
  return {
    ...base,
    series: [
      {
        key: "all",
        label: groups.length === 1 ? groups[0] : "All groups",
        colour: "var(--grass)",
        points: sessions.map((s) => ({ pct: s.pct, checkedIn: s.checkedIn, expected: s.expected })),
      },
    ],
  };
}
