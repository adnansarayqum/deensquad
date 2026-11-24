import "server-only";
import { reportJobFailure } from "../alerts";
import { appUrl } from "../config";
import { londonDate, londonIsoDate } from "../dates";
import { asSystem, asUser } from "../db";
import type { Queryable } from "../db/types";
import { sendEmails, type Email } from "../email/send";
import { mondayBriefingEmail } from "../email/templates";
import { greetingName } from "../greeting";
import { loadDashboard } from "./dashboard";
import { needsYou, nextSessionSummary } from "./overview";

// The admins' Monday briefing (the end-to-end verdict, 24 Nov 2026): one email on Monday morning listing what the
// overview's "Needs you" shows, so the week starts with what to act on. Sent once a week (claimed in club_settings
// `monday_briefing`), only when something is waiting, between 8am and midday London (later runs are the retry).

export function briefingDue(now: Date): boolean {
  const d = londonDate(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now));
  return d.weekday === 1 && hour >= 8 && hour < 12;
}

export type BriefingResult = { due: boolean; sent: number; lines: number };

export async function sendMondayBriefing(
  deps: {
    system: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
    /** The figures are read as an admin, so they are exactly the overview's (some need a signed-in member of staff). */
    asUser: <T>(userId: string, fn: (tx: Queryable) => Promise<T>) => Promise<T>;
    send: (emails: Email[]) => Promise<{ sent: Email[]; failed: Email[] }>; appUrl: string | null;
  },
  now: Date,
): Promise<BriefingResult> {
  if (!briefingDue(now)) return { due: false, sent: 0, lines: 0 };
  const week = londonIsoDate(now);
  const claimed = await deps.system(async (tx) => {
    // The week is claimed first, so two runs at once (or the old and new server during a deploy) send one email.
    const won = await tx.query(
      `insert into club_settings (key, value) values ('monday_briefing', jsonb_build_object('week', $1::text))
       on conflict (key) do update set value = excluded.value, updated_at = now()
       where club_settings.value->>'week' is distinct from excluded.value->>'week' returning key`,
      [week],
    );
    if (!won.length) return null;
    const admins = await tx.query<{ id: string; email: string; display_name: string; user_id: string | null }>(
      `select id, email, display_name, auth_user_id as user_id from staff where role = 'admin' and email is not null order by display_name`,
    );
    return { admins };
  });
  if (!claimed) return { due: true, sent: 0, lines: 0 };
  const reader = claimed.admins.find((a) => a.user_id)?.user_id;
  const plan = reader
    ? await deps.asUser(reader, async (tx) => {
        const d = await loadDashboard(tx, { now, limit: null, withShop: true });
        const next = nextSessionSummary(d, now);
        return {
          rows: needsYou(d, now, { canInvite: true }),
          admins: claimed.admins,
          next: next ? `Next session ${next.day === "Today" || next.day === "Tomorrow" ? next.day.toLowerCase() : `on ${next.day}`}: ${next.coming} of ${next.squad} children coming so far.` : null,
        };
      })
    : null;
  if (!plan) return { due: true, sent: 0, lines: 0 };
  if (!plan.rows.length || !plan.admins.length) return { due: true, sent: 0, lines: plan.rows.length };
  const emails = plan.admins.map((a) => ({
    ...mondayBriefingEmail({
      to: a.email,
      firstName: greetingName(a.display_name),
      lines: plan.rows.map((r) => ({ count: r.count, text: r.text, path: r.href })),
      next: plan.next,
      appUrl: deps.appUrl,
    }),
    idempotencyKey: `monday-briefing:${week}:${a.id}`,
  }));
  const result = await deps.send(emails);
  // Nobody got it: give the week back, so the next hourly run this morning tries again.
  if (result.sent.length === 0) await deps.system((tx) => tx.query(`delete from club_settings where key = 'monday_briefing' and value->>'week' = $1`, [week]));
  return { due: true, sent: result.sent.length, lines: plan.rows.length };
}

/** The hourly job's step. Never throws. */
export async function runMondayBriefing(now = new Date()): Promise<BriefingResult | { error: string }> {
  try {
    return await sendMondayBriefing({ system: asSystem, asUser, send: sendEmails, appUrl: appUrl() }, now);
  } catch (error) {
    reportJobFailure("monday briefing", error);
    return { error: "failed" };
  }
}
