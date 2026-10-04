import type { Queryable } from "../db/types";

// The announcement chase ladder. For each message that asks parents to tap "I've read this":
//   app    straight away   push notification to parents who turned notifications on
//   email  after 24 hours  reminder email
//   sms    after 48 hours  text message (only when a text provider is set up)
//   gate   by session day  the coach's register flags the child (see staff/register.ts)
// A parent is never chased once they, or the other parent of the same child, have read it.
// Nothing is sent between 9pm and 8am London time; due steps go out at the next run after 8am.
// Every step is logged in announcement_chases, so each runs at most once per parent per message.

export type ChaseChannel = "app" | "email" | "sms";

export const LADDER: Record<ChaseChannel, { afterHours: number }> = {
  app: { afterHours: 0 },
  email: { afterHours: 24 },
  sms: { afterHours: 48 },
};

/** Messages older than this are left alone. */
export const MAX_AGE_DAYS = 7;

export function inQuietHours(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour >= 21 || hour < 8;
}

export type ChaseTarget = {
  announcementId: string;
  title: string;
  body: string;
  guardianId: string;
  userId: string | null;
  firstName: string;
  email: string | null;
  phone: string | null;
  children: string[];
};

/** Parents due a given step: the message is old enough, they and their child's other parent haven't read it, and the step hasn't run. */
export async function dueChases(tx: Queryable, channel: ChaseChannel, now: Date, announcementId?: string): Promise<ChaseTarget[]> {
  const dueBefore = new Date(now.getTime() - LADDER[channel].afterHours * 3600_000);
  const oldest = new Date(now.getTime() - MAX_AGE_DAYS * 86400_000);
  const rows = await tx.query<{
    announcement_id: string;
    title: string;
    body: string;
    guardian_id: string;
    user_id: string | null;
    first_name: string;
    email: string | null;
    phone: string | null;
    children: string[];
  }>(
    `select a.id as announcement_id, a.title, a.body, g.id as guardian_id, g.auth_user_id as user_id, g.first_name, g.email, g.phone,
       array_agg(distinct p.first_name order by p.first_name) as children
     from announcements a
     join players p on a.audience is null or p.age_group = any (a.audience)
     join player_guardians pg on pg.player_id = p.id
     join guardians g on g.id = pg.guardian_id
     where a.requires_ack
       and a.posted_at <= $1 and a.posted_at > $2
       and ($4::uuid is null or a.id = $4)
       -- this parent hasn't read it, and nobody who shares a child with them has either
       and not exists (
         select 1 from announcement_reads r
         join player_guardians shared on shared.guardian_id = r.guardian_id
         join player_guardians mine on mine.player_id = shared.player_id and mine.guardian_id = g.id
         where r.announcement_id = a.id
       )
       and not exists (select 1 from announcement_chases c where c.announcement_id = a.id and c.guardian_id = g.id and c.channel::text = $3)
     group by a.id, a.title, a.body, g.id`,
    [dueBefore, oldest, channel, announcementId ?? null],
  );
  return rows.map((r) => ({
    announcementId: r.announcement_id,
    title: r.title,
    body: r.body,
    guardianId: r.guardian_id,
    userId: r.user_id,
    firstName: r.first_name,
    email: r.email,
    phone: r.phone,
    children: r.children,
  }));
}

export async function logChases(tx: Queryable, channel: ChaseChannel, targets: { announcementId: string; guardianId: string }[]): Promise<void> {
  for (const t of targets) {
    await tx.query(
      `insert into announcement_chases (announcement_id, guardian_id, channel) select $1, $2, $3::text::chase_channel
       where not exists (select 1 from announcement_chases where announcement_id = $1 and guardian_id = $2 and channel::text = $3)`,
      [t.announcementId, t.guardianId, channel],
    );
  }
}

/** Who can actually be reached on a channel. */
export function reachable(channel: ChaseChannel, t: ChaseTarget, pushUsers: Set<string>): boolean {
  if (channel === "app") return t.userId !== null && pushUsers.has(t.userId);
  if (channel === "email") return Boolean(t.email);
  return Boolean(t.phone);
}

export type Senders = {
  /** Sends and returns the targets that were reached. Missing = channel not set up. */
  app?: (targets: ChaseTarget[], tx: Queryable) => Promise<ChaseTarget[]>;
  email?: (targets: ChaseTarget[], tx: Queryable) => Promise<ChaseTarget[]>;
  sms?: (targets: ChaseTarget[], tx: Queryable) => Promise<ChaseTarget[]>;
  pushUsers: (tx: Queryable) => Promise<Set<string>>;
};

export type LadderResult = { quiet: boolean } & Record<ChaseChannel, number>;

/**
 * Runs every due step once. Steps whose channel isn't set up are skipped and stay due,
 * so they go out once it is (until the message is a week old).
 * Holds an advisory lock so two runs can't send the same reminder twice.
 */
export async function runLadder(tx: Queryable, now: Date, senders: Senders, announcementId?: string): Promise<LadderResult> {
  const result: LadderResult = { quiet: inQuietHours(now), app: 0, email: 0, sms: 0 };
  if (result.quiet) return result;
  await tx.query("select pg_advisory_xact_lock(727275)");
  const pushUsers = await senders.pushUsers(tx);
  for (const channel of ["app", "email", "sms"] as const) {
    const send = senders[channel];
    if (!send) continue;
    const due = (await dueChases(tx, channel, now, announcementId)).filter((t) => reachable(channel, t, pushUsers));
    if (due.length === 0) continue;
    const sent = await send(due, tx);
    await logChases(tx, channel, sent);
    result[channel] = sent.length;
  }
  return result;
}
