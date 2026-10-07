import type { Queryable } from "../db/types";
import { londonDate, londonTime } from "../dates";
import { AGE_GROUPS, type AgeGroup } from "../domain";
import type { Email, EmailReport } from "../email/send";
import { monthlySummaryEmail } from "../email/templates";
import { averagePct, groupAttendance, loadDashboard } from "./dashboard";
import { newsReaches } from "../squads/sql";

// The owner's monthly summary: on the 1st of each month (the first hourly run at or after 8am London), admins are
// emailed last month's figures. Month figures (sessions, attendance, joiners, news, shop) are for that calendar month
// in London time; the rest (invites, payments, contracts, deletion requests, children missing lately) are as they
// stand when it's sent, from the overview's own queries (loadDashboard), so they match the pages they link to.
// Counts only: never a child's or parent's name. Preview any month at /admin/summary?month=YYYY-MM (admins only).

export type SummaryMonth = { year: number; month: number };

export const monthKey = (m: SummaryMonth) => `${m.year}-${String(m.month).padStart(2, "0")}`;

export function parseMonth(value: unknown): SummaryMonth | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month] = [Number(match[1]), Number(match[2])];
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2100 ? { year, month } : null;
}

export function previousMonth(m: SummaryMonth): SummaryMonth {
  return m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 };
}

/** The London calendar month `now` falls in. */
export function monthOf(now: Date): SummaryMonth {
  const d = londonDate(now);
  return { year: d.year, month: d.month };
}

/** Midnight London on the 1st, to midnight London on the 1st of the next month (exclusive). */
export function monthRange(m: SummaryMonth): { from: Date; to: Date } {
  const next = m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 };
  return { from: londonTime(m.year, m.month, 1, 0, 0), to: londonTime(next.year, next.month, 1, 0, 0) };
}

export const monthName = (m: SummaryMonth) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(m.year, m.month - 1, 15)));

const londonHour = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(now));

/**
 * The month to send a summary for at `now`, or null. Due from 8am London on the 1st (for the month before); the 2nd
 * is a second chance if every send failed on the 1st. Never before 8am, never after the 2nd.
 */
export function summaryDue(now: Date): SummaryMonth | null {
  const d = londonDate(now);
  if (d.day > 2 || londonHour(now) < 8) return null;
  return previousMonth({ year: d.year, month: d.month });
}

export type MonthlySummary = {
  month: SummaryMonth;
  sessions: { held: number; cancelled: number };
  attendance: { overall: number | null; overallBefore: number | null; groups: { group: AgeGroup; held: number; pct: number | null; before: number | null }[] };
  joined: { children: number; parents: number };
  news: { posted: number; askedToRead: number; readPct: number | null };
  shop: { orders: number; takingsPence: number };
  now: { invitedNotIn: number; noPlan: number; overdue: number; contractUnsigned: number; deletionRequests: number; missedLast3: number };
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Last month's figures (`month`), with the "right now" figures as at `now`. Run as an admin or the system. */
export async function loadMonthlySummary(tx: Queryable, month: SummaryMonth, now: Date): Promise<MonthlySummary> {
  const { from, to } = monthRange(month);
  const before = monthRange(previousMonth(month));
  const until = new Date(Math.min(to.getTime(), now.getTime()));
  const groups = [...AGE_GROUPS];
  const reaches = newsReaches("a", "p");

  const [dash, thisMonth, lastMonth, [counts], [news]] = await Promise.all([
    loadDashboard(tx, { now, limit: null, withShop: true, withRequests: true }),
    groupAttendance(tx, groups, from, until),
    groupAttendance(tx, groups, before.from, before.to),
    tx.query<{ held: number; cancelled: number; children: number; parents: number; orders: number; takings: number }>(
      `select
         (select count(*)::int from sessions where starts_at >= $1 and starts_at < $2 and ends_at <= $3 and cancelled_at is null) as held,
         (select count(*)::int from sessions where starts_at >= $1 and starts_at < $2 and cancelled_at is not null) as cancelled,
         (select count(*)::int from players where joined_on >= ($1 at time zone 'Europe/London')::date and joined_on < ($2 at time zone 'Europe/London')::date) as children,
         (select count(*)::int from guardians where created_at >= $1 and created_at < $2) as parents,
         (select count(*)::int from shop_orders where created_at >= $1 and created_at < $2 and status <> 'cancelled') as orders,
         (select coalesce(sum(total_pence), 0)::int from shop_orders
           where status in ('paid', 'ordered', 'ready', 'collected') and paid_at >= $1 and paid_at < $2) as takings`,
      [from, to, now],
    ),
    // The same read counts as the overview's news list, over the messages posted in the month that ask to be read.
    tx.query<{ posted: number; asked: number; total: number; read: number }>(
      `with m as (
         select a.*,
           (select count(distinct pg.guardian_id)::int from player_guardians pg join players p on p.id = pg.player_id where ${reaches}) as total,
           (select count(distinct r.guardian_id)::int from announcement_reads r
             join player_guardians pg on pg.guardian_id = r.guardian_id join players p on p.id = pg.player_id
             where r.announcement_id = a.id and ${reaches}) as read
         from announcements a where a.posted_at >= $1 and a.posted_at < $2
       )
       select count(*)::int as posted, (count(*) filter (where requires_ack))::int as asked,
         coalesce(sum(total) filter (where requires_ack), 0)::int as total,
         coalesce(sum(least(read, total)) filter (where requires_ack), 0)::int as read
       from m`,
      [from, to],
    ),
  ]);

  const shown = thisMonth.filter((g, i) => g.held > 0 || lastMonth[i].held > 0);
  return {
    month,
    sessions: { held: counts.held, cancelled: counts.cancelled },
    attendance: {
      overall: averagePct(sum(thisMonth.map((g) => g.checkedIn)), sum(thisMonth.map((g) => g.expected))),
      overallBefore: averagePct(sum(lastMonth.map((g) => g.checkedIn)), sum(lastMonth.map((g) => g.expected))),
      groups: shown.map((g) => ({ group: g.group, held: g.held, pct: g.averagePct, before: lastMonth.find((l) => l.group === g.group)?.averagePct ?? null })),
    },
    joined: { children: counts.children, parents: counts.parents },
    news: { posted: news.posted, askedToRead: news.asked, readPct: averagePct(news.read, news.total) },
    shop: { orders: counts.orders, takingsPence: counts.takings },
    now: {
      invitedNotIn: dash.families.invited,
      noPlan: dash.payments.missing,
      overdue: dash.payments.overdue,
      contractUnsigned: dash.families.todo.contract,
      deletionRequests: dash.deletionRequests?.length ?? 0,
      missedLast3: dash.attendance.missedLast3,
    },
  };
}

export type SummaryLine = { text: string; path: string };
export type SummarySection = { title: string; lines: SummaryLine[] };

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const pct = (value: number | null) => (value === null ? "no register taken" : `${value}%`);
const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

/** The summary as short lines, each linking to the admin page where it can be acted on. Used by the email and the preview. */
export function summarySections(s: MonthlySummary): SummarySection[] {
  const name = monthName(s.month).split(" ")[0];
  const before = monthName(previousMonth(s.month)).split(" ")[0];
  const attendance: SummaryLine[] = [
    {
      text:
        s.attendance.overall === null && s.attendance.overallBefore === null
          ? "Attendance: no registers were taken."
          : `Attendance: ${pct(s.attendance.overall)} of the children expected were checked in (${before}: ${pct(s.attendance.overallBefore)}).`,
      path: "/admin",
    },
    ...s.attendance.groups.map((g) => ({
      text: `${g.group}: ${pct(g.pct)} over ${n(g.held, "session", "sessions")} with the register taken (${before}: ${pct(g.before)}).`,
      path: "/admin",
    })),
  ];
  return [
    {
      title: `In ${name}`,
      lines: [
        { text: `Sessions: ${s.sessions.held} held, ${s.sessions.cancelled} cancelled.`, path: "/admin/sessions" },
        ...attendance,
        { text: `Joined: ${n(s.joined.children, "child", "children")} and ${n(s.joined.parents, "new parent", "new parents")}.`, path: "/admin/families" },
        {
          text:
            s.news.askedToRead === 0
              ? `News: ${n(s.news.posted, "message", "messages")} posted.`
              : `News: ${n(s.news.posted, "message", "messages")} posted. On the ${s.news.askedToRead} that asked, ${s.news.readPct ?? 0}% of parents tapped ‘I’ve read this’.`,
          path: "/admin/news",
        },
        { text: `Shop: ${n(s.shop.orders, "order", "orders")} placed, ${pounds(s.shop.takingsPence)} paid.`, path: "/admin/shop" },
      ],
    },
    {
      title: "Right now",
      lines: [
        { text: `${n(s.now.invitedNotIn, "parent has", "parents have")} been invited but not signed in yet.`, path: "/admin/families?need=signin" },
        { text: `${n(s.now.noPlan, "child has", "children have")} no payment plan set up.`, path: "/admin/families?need=missing" },
        { text: `${n(s.now.overdue, "child's payment is", "children's payments are")} overdue.`, path: "/admin/families?need=overdue" },
        { text: `${n(s.now.contractUnsigned, "child hasn't", "children haven't")} had this season's contract signed.`, path: "/admin/families?need=contract" },
        { text: `${n(s.now.missedLast3, "child has", "children have")} missed their last 3 sessions.`, path: "/admin/families?need=missing3" },
        { text: `${n(s.now.deletionRequests, "request", "requests")} to delete an account still open.`, path: "/admin" },
      ],
    },
  ];
}

export type SummaryRunResult =
  | { skipped: "not due" | "already sent" | "no recipients" }
  | { month: string; sent: number; failed: number };

type Runner = <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;

const addresses = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));

/** A claim left unsent this long (a crash mid-send) can be taken again; Resend's idempotency keys stop a double send. */
const STALE_CLAIM_MS = 30 * 60_000;

/**
 * The hourly job's part: when a summary is due and hasn't gone, claims the month (one row in monthly_summaries),
 * emails SUMMARY_EMAIL or else every admin on the Staff screen, and marks it sent once anyone got it. If every
 * email failed the claim is removed, so the next hourly run tries again (on the 1st and 2nd only).
 */
export async function sendMonthlySummary(
  deps: { system: Runner; send: (emails: Email[]) => Promise<EmailReport>; appUrl: string | null; env: Record<string, string | undefined> },
  now: Date,
): Promise<SummaryRunResult> {
  const month = summaryDue(now);
  if (!month) return { skipped: "not due" };
  const key = monthKey(month);
  const date = `${key}-01`;
  const claimed = await deps.system((tx) =>
    tx.query(
      `insert into monthly_summaries (month, created_at) values ($1::date, $2) on conflict (month) do update set created_at = excluded.created_at
       where monthly_summaries.sent_at is null and monthly_summaries.created_at < $3
       returning month`,
      [date, now, new Date(now.getTime() - STALE_CLAIM_MS)],
    ),
  );
  if (claimed.length === 0) return { skipped: "already sent" };
  const release = () => deps.system((tx) => tx.query(`delete from monthly_summaries where month = $1::date and sent_at is null`, [date]));

  let report: EmailReport;
  try {
    const { summary, to } = await deps.system(async (tx) => {
      const summary = await loadMonthlySummary(tx, month, now);
      const fixed = addresses(deps.env.SUMMARY_EMAIL);
      const to = fixed.length
        ? [...new Set(fixed)].map((email) => ({ email, key: `summary:${key}:${email.toLowerCase()}` }))
        : (await tx.query<{ id: string; email: string }>(`select id, email from staff where role = 'admin' order by created_at`))
            .filter((a) => a.email.includes("@"))
            .map((a) => ({ email: a.email, key: `summary:${key}:${a.id}` }));
      return { summary, to };
    });
    if (to.length === 0) {
      await release();
      return { skipped: "no recipients" };
    }
    const sections = summarySections(summary);
    report = await deps.send(
      to.map((r) => ({ ...monthlySummaryEmail({ to: r.email, month: monthName(month), sections, appUrl: deps.appUrl }), idempotencyKey: r.key })),
    );
  } catch (error) {
    await release();
    throw error;
  }

  if (report.sent.length > 0) {
    await deps.system((tx) => tx.query(`update monthly_summaries set sent_at = $2 where month = $1::date`, [date, now]));
  } else {
    await release();
    console.error(`[summary] ${key} not sent to anyone;${londonDate(now).day >= 2 ? " the last retry is today, before midnight." : " trying again next hour."}`);
  }
  return { month: key, sent: report.sent.length, failed: report.failed.length };
}
