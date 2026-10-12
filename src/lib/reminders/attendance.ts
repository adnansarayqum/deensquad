import { inQuietHours } from "../chase/ladder";
import { clock } from "../dates";
import type { Queryable } from "../db/types";
import type { Email, EmailReport } from "../email/send";
import { attendanceReminderEmail } from "../email/templates";
import { attendanceReminderSetting, type AttendanceReminder } from "../settings";
import { sessionIsFor } from "../squads/sql";

// The weekly "Is <child> coming?" reminder (the owner's request: "every Wednesday at 5pm", as Spond did). The hourly
// cron calls `sendAttendanceReminders`. On the chosen London weekday, from the chosen hour (club_settings
// 'attendance_reminder'; absent = on, Wednesday, 17:00), every child's next session (for them: `sessionIsFor`, so a
// squad session only for the picked children; not cancelled; not started) that falls within the next 4 London days
// and has no answer yet puts their parents on the list. Each parent gets one notification for all their unanswered
// children: an app notification where they've turned one on, else an email. Logged per parent per session in
// attendance_reminders (only those actually reached), so a parent is never reminded twice about one session and a
// failed send is tried again by the next hourly run that day. Never on another day, never in quiet hours (9pm–8am).

/** Sessions starting up to this many London days ahead (Wednesday → Sunday). */
export const REMINDER_WINDOW_DAYS = 4;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function londonParts(now: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), hour: Number(get("hour")) };
}

/** Whether the reminder may go at `now`: switched on, the chosen London weekday, at or after the chosen hour, not quiet hours. */
export function reminderDue(setting: AttendanceReminder, now: Date): boolean {
  if (!setting.enabled || inQuietHours(now)) return false;
  const { weekday, hour } = londonParts(now);
  return weekday === setting.day && hour >= setting.hour;
}

/** "Wednesdays at 5pm" */
export function reminderWhen(setting: Pick<AttendanceReminder, "day" | "hour">): string {
  const h = setting.hour % 12 || 12;
  return `${WEEKDAYS[setting.day]}s at ${h}${setting.hour < 12 ? "am" : "pm"}`;
}

export const weekdayName = (day: number) => WEEKDAYS[day];

export type ReminderItem = {
  sessionId: string;
  playerId: string;
  child: string;
  title: string;
  startsAt: string;
  venue: string;
  squad: boolean;
};

export type ReminderTarget = {
  guardianId: string;
  userId: string | null;
  email: string | null;
  firstName: string;
  items: ReminderItem[];
};

/** "Yusuf", "Yusuf and Musa", "Yusuf, Musa and Maryam" */
export function namesList(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const londonDay = (iso: string, weekday: "long" | "short") => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday }).format(new Date(iso));
const londonDateKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
const venueKnown = (venue: string) => !/^\s*(tbc|to be confirmed)\.?\s*$/i.test(venue);

/**
 * The question and one line of detail: "Is Musa coming on Friday?" / "Training 6:30pm at Bobby Moore Sports Hub.";
 * a squad session "Can Musa play in Autumn Cup on Sat?". Several sessions: the children together, and the detail
 * asks for an answer for each.
 */
export function reminderMessage(items: ReminderItem[]): { question: string; detail: string } {
  const children = [...new Set(items.map((i) => i.child))];
  const names = namesList(children);
  const verb = children.length > 1 ? "Are" : "Is";
  const sessions = [...new Map(items.map((i) => [i.sessionId, i])).values()];
  if (sessions.length === 1) {
    const s = sessions[0];
    const where = `${clock(s.startsAt)}${venueKnown(s.venue) ? ` at ${s.venue}` : ""}`;
    if (s.squad) return { question: `Can ${names} play in ${s.title} on ${londonDay(s.startsAt, "short")}?`, detail: `${s.title} ${where}.` };
    return { question: `${verb} ${names} coming on ${londonDay(s.startsAt, "long")}?`, detail: `${s.title} ${where}.` };
  }
  const oneDay = new Set(sessions.map((s) => londonDateKey(s.startsAt))).size === 1;
  return {
    question: `${verb} ${names} coming ${oneDay ? `on ${londonDay(sessions[0].startsAt, "long")}` : "this week"}?`,
    detail: "Please answer for each of them.",
  };
}

/**
 * Parents with at least one child whose next session (within the window) has no answer, and who haven't been
 * reminded about that session. Runs without row level security (asSystem).
 */
export async function dueReminders(tx: Queryable, now: Date): Promise<ReminderTarget[]> {
  const rows = await tx.query<{
    guardian_id: string;
    user_id: string | null;
    email: string | null;
    guardian_name: string;
    session_id: string;
    player_id: string;
    child: string;
    title: string;
    starts_at: Date;
    venue: string;
    squad: boolean;
  }>(
    `with nxt as (
       -- each child's next session: for them, not cancelled, not started (a week ahead is enough to find it)
       select distinct on (p.id) p.id as player_id, p.first_name, s.id as session_id, s.title, s.starts_at, s.venue,
         is_squad_session(s.id) as squad
       from players p
       join sessions s on s.cancelled_at is null and s.starts_at > $1 and s.starts_at < $1::timestamptz + interval '7 days'
         and ${sessionIsFor("s", "p")}
       order by p.id, s.starts_at, s.id
     )
     select g.id as guardian_id, g.auth_user_id as user_id, g.email, g.first_name as guardian_name,
       n.session_id, n.player_id, n.first_name as child, n.title, n.starts_at, n.venue, n.squad
     from nxt n
     join player_guardians pg on pg.player_id = n.player_id
     join guardians g on g.id = pg.guardian_id
     where (n.starts_at at time zone 'Europe/London')::date <= ($1::timestamptz at time zone 'Europe/London')::date + $2::int
       and not exists (select 1 from availability v where v.session_id = n.session_id and v.player_id = n.player_id)
       and not exists (select 1 from attendance_reminders r where r.session_id = n.session_id and r.guardian_id = g.id)
     order by g.id, n.starts_at, n.first_name`,
    [now, REMINDER_WINDOW_DAYS],
  );
  const byGuardian = new Map<string, ReminderTarget>();
  for (const r of rows) {
    const target = byGuardian.get(r.guardian_id) ?? { guardianId: r.guardian_id, userId: r.user_id, email: r.email, firstName: r.guardian_name, items: [] };
    target.items.push({
      sessionId: r.session_id,
      playerId: r.player_id,
      child: r.child,
      title: r.title,
      startsAt: new Date(r.starts_at).toISOString(),
      venue: r.venue,
      squad: r.squad,
    });
    byGuardian.set(r.guardian_id, target);
  }
  return [...byGuardian.values()];
}

export type ReminderSenders = {
  /** Who has an app notification turned on. */
  pushUsers: (tx: Queryable) => Promise<Set<string>>;
  /** Sends each user their own notification; returns the users reached. Missing: not set up. */
  push?: (tx: Queryable, payloads: Map<string, { title: string; body: string; url: string }>) => Promise<Set<string>>;
  /** Missing: email isn't set up. */
  email?: (emails: Email[]) => Promise<EmailReport>;
  /** The app's address for links in emails. */
  appUrl: string | null;
};

export type ReminderResult = { due: boolean; push: number; email: number };

/**
 * Sends the weekly reminder to everyone due it (see the top of this file) and logs who was reached. Holds an
 * advisory lock so two runs can't remind the same parent twice.
 */
export async function sendAttendanceReminders(tx: Queryable, now: Date, senders: ReminderSenders): Promise<ReminderResult> {
  const result: ReminderResult = { due: reminderDue(await attendanceReminderSetting(tx), now), push: 0, email: 0 };
  if (!result.due) return result;
  await tx.query("select pg_advisory_xact_lock(727277)");
  const due = await dueReminders(tx, now);
  if (due.length === 0) return result;
  const withPush = senders.push ? await senders.pushUsers(tx) : new Set<string>();
  const told: { target: ReminderTarget; channel: "app" | "email" }[] = [];

  const byPush = due.filter((t) => t.userId && withPush.has(t.userId));
  if (byPush.length) {
    const payloads = new Map(
      byPush.map((t) => {
        const m = reminderMessage(t.items);
        return [t.userId!, { title: m.question, body: `${m.detail} Tap to answer.`, url: "/friday" }];
      }),
    );
    const reached = await senders.push!(tx, payloads);
    for (const t of byPush) if (reached.has(t.userId!)) told.push({ target: t, channel: "app" });
  }

  const byEmail = due.filter((t) => !(t.userId && withPush.has(t.userId)) && t.email);
  if (senders.email && senders.appUrl && byEmail.length) {
    const link = `${senders.appUrl}/friday`;
    const emails = byEmail.map((t) => {
      const m = reminderMessage(t.items);
      const sessionIds = [...new Set(t.items.map((i) => i.sessionId))].sort();
      const email = attendanceReminderEmail({ to: t.email!, firstName: t.firstName, question: m.question, detail: m.detail, link, appUrl: senders.appUrl });
      // A later run retrying one that timed out but went can't email this parent twice.
      return { target: t, email: { ...email, idempotencyKey: `attendance:${sessionIds.join(",")}:${t.guardianId}` } };
    });
    const report = await senders.email(emails.map((e) => e.email));
    const went = new Set(report.sent);
    for (const e of emails) if (went.has(e.email)) told.push({ target: e.target, channel: "email" });
  }

  for (const { target, channel } of told) {
    for (const sessionId of new Set(target.items.map((i) => i.sessionId))) {
      await tx.query(
        `insert into attendance_reminders (session_id, guardian_id, sent_at, channel) values ($1, $2, $3, $4) on conflict do nothing`,
        [sessionId, target.guardianId, now, channel],
      );
    }
  }
  result.push = told.filter((t) => t.channel === "app").length;
  result.email = told.length - result.push;
  return result;
}

/** "Last sent: Wed 7 Oct, 23 parents": the latest day anything went and how many parents were reached that London day. */
export async function lastReminderSent(tx: Queryable): Promise<{ at: string; parents: number } | null> {
  const [row] = await tx.query<{ at: Date | null; parents: number }>(
    `with last as (select max(sent_at) as at from attendance_reminders)
     select (select at from last) as at,
       (select count(distinct guardian_id)::int from attendance_reminders r, last
        where (r.sent_at at time zone 'Europe/London')::date = (last.at at time zone 'Europe/London')::date) as parents`,
  );
  return row?.at ? { at: new Date(row.at).toISOString(), parents: row.parents } : null;
}
