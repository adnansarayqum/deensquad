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

/**
 * The start every group with a session coming up shares, or null when they differ (or none has one): then the Next
 * session section says the time once, in its heading. A group with nothing coming up doesn't stop that.
 */
export function sharedStart(groups: readonly NextSessionGroup[]): string | null {
  const times = new Set(groups.flatMap((g) => (g.session ? [g.session.startsAt] : [])));
  return times.size === 1 ? [...times][0] : null;
}

export type NeedRow = { key: string; count: number; text: string; href: string };

/**
 * Everything waiting on staff, most pressing first, leaving out anything at 0. The page shows the first 5. A session
 * whose answers are still missing counts only when it's today, tomorrow or the day after. Parents not invited yet are
 * only an admin's to-do (`canInvite`): coaches can't send invites, and their Families list has no parent count to
 * match the figure. Each count equals a number on the page it opens: the invite row matches the Families banner's
 * parent count, and the sign-in row counts children, as that list does.
 */
export function needsYou(d: Dashboard, now: Date, { canInvite }: { canInvite: boolean }): NeedRow[] {
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
    { key: "invite", count: canInvite ? f.notInvited : 0, text: plural(f.notInvited, "parent not invited yet", "parents not invited yet"), href: "/admin/families?need=invite" },
    {
      key: "missing3",
      count: d.attendance.missedLast3,
      text: plural(d.attendance.missedLast3, "child missed their last 3 sessions", "children missed their last 3 sessions"),
      href: "/admin/families?need=missing3",
    },
    { key: "unread", count: d.news.behind, text: plural(d.news.behind, "parent behind on news", "parents behind on news"), href: "/admin/families?need=unread" },
    { key: "missing", count: d.payments.missing, text: plural(d.payments.missing, "child without a payment plan", "children without a payment plan"), href: "/admin/families?need=missing" },
    {
      key: "signin",
      count: f.childrenAwaitingSignIn,
      text: plural(f.childrenAwaitingSignIn, "child whose parent is invited, not signed in", "children whose parent is invited, not signed in"),
      href: "/admin/families?need=signin",
    },
  ];
  return rows.filter((r) => r.count > 0);
}

/** Read ÷ asked over the messages shown on the overview, as a whole percentage; null when none ask to be read. */
export function newsReadPct(recent: Dashboard["news"]["recent"]): { pct: number; read: number; total: number } | null {
  const read = recent.reduce((n, m) => n + m.read, 0);
  const total = recent.reduce((n, m) => n + m.total, 0);
  return total > 0 ? { pct: Math.round((read / total) * 100), read, total } : null;
}

/**
 * A series' value at a session: the group's figures; "no-register" when the session was for the group but nobody
 * from it was marked in (the line breaks there); null when the session wasn't for the group at all (the line
 * carries on across it).
 */
export type ChartPoint = { pct: number; checkedIn: number; expected: number } | "no-register" | null;
export type ChartFigures = Exclude<ChartPoint, string | null>;
export type ChartSeries = { key: string; label: string; colour: string; points: ChartPoint[] };
export type AttendanceChartData = { sessions: { id: string; title: string; startsAt: string }[]; series: ChartSeries[] };

export const figures = (p: ChartPoint): p is ChartFigures => typeof p === "object" && p !== null;

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
          if (g) return { pct: g.pct, checkedIn: g.checkedIn, expected: g.expected };
          return s.forGroups.includes(group) ? "no-register" : null;
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

export type RunPoint = { i: number; x: number; y: number };

/**
 * The stretches a series is drawn as: consecutive figures joined, carrying on across sessions that weren't the
 * group's, and breaking only where the group's register wasn't taken. A run of one is a lone point (drawn as a dot).
 */
export function seriesRuns(points: ChartPoint[], xs: number[]): RunPoint[][] {
  const out: RunPoint[][] = [];
  let run: RunPoint[] = [];
  points.forEach((p, i) => {
    if (figures(p)) run.push({ i, x: xs[i], y: 100 - p.pct });
    else if (p === "no-register" && run.length) {
      out.push(run);
      run = [];
    }
  });
  if (run.length) out.push(run);
  return out;
}

export type EndLabel = { key: string; label: string; colour: string; pct: number; top: number };

/**
 * Each series' latest value, labelled at the end of its line at the line's height (`top` in px from the plot's top),
 * nudged apart by `gap` px top to bottom so none overlap, and kept inside the plot (`height` px). Each label keeps
 * its own colour, so a nudged one still reads as its line's.
 */
export function endLabels(series: ChartSeries[], height: number, gap: number): EndLabel[] {
  const ends = series
    .map((s) => {
      const i = s.points.findLastIndex(figures);
      const p = i < 0 ? null : s.points[i];
      return figures(p) ? { key: s.key, label: s.label, colour: s.colour, pct: p.pct, top: (1 - p.pct / 100) * height } : null;
    })
    .filter((e) => e !== null)
    .sort((a, b) => a.top - b.top);
  const half = gap / 2;
  for (let i = 1; i < ends.length; i++) ends[i].top = Math.max(ends[i].top, ends[i - 1].top + gap);
  for (let i = ends.length - 1; i >= 0; i--) {
    const below = i === ends.length - 1 ? height - half : ends[i + 1].top - gap;
    ends[i].top = Math.min(ends[i].top, below);
  }
  for (let i = 0; i < ends.length; i++) ends[i].top = Math.max(ends[i].top, i === 0 ? half : ends[i - 1].top + gap);
  return ends;
}
