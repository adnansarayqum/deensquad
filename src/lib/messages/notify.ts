import type { Queryable } from "../db/types";
import { inQuietHours } from "../chase/ladder";
import type { Email, EmailReport } from "../email/send";
import { messageEmail } from "../email/templates";

// Tells people about a new message in a conversation (migration 0025). Runs without row level security (asSystem),
// right after a message is sent (in after() + enqueue) and from the hourly cron.
//
// Who is told:
//   a parent's message  the member of staff it's addressed to; for one addressed to "the coaches", the coaches of the
//                       child's group, or the admins when the group has none (admins see every conversation in their
//                       inbox anyway, so they aren't pushed about other people's)
//   a staff message     every parent of the child (not the one who wrote it, on either side)
// How: an app notification to anyone with one turned on, else an email when we have their address. The email names
// who wrote and which child, never the message itself (emails get forwarded and stored elsewhere); the app
// notification never carries it either (a lock screen can be seen by anyone): "Open the app to read it."
// When: at most one notification per conversation per person every 15 minutes, and never 9pm to 8am London. A message
// held back (quiet hours, or within 15 minutes of the last one) goes out at the next run after that, if it's still
// unread, as one notification however many came in. Messages over a week old are left alone.

export const NOTICE_GAP_MINUTES = 15;
export const NOTICE_MAX_AGE_DAYS = 7;

export type Recipient = {
  conversationId: string;
  recipientId: string;
  side: "parent" | "staff";
  userId: string | null;
  email: string | null;
  firstName: string;
  child: string;
  author: string;
  body: string;
};

/** People with an unread, un-notified message waiting, and not notified about that conversation in the last 15 minutes. */
export async function dueNotices(tx: Queryable, now: Date, conversationId: string | null = null): Promise<Recipient[]> {
  const rows = await tx.query<{
    conversation_id: string;
    recipient_id: string;
    side: "parent" | "staff";
    user_id: string | null;
    email: string | null;
    first_name: string;
    child: string;
    author: string;
    body: string;
  }>(
    `with latest as (
       -- the newest message from each side of each conversation (recent ones only)
       select distinct on (m.conversation_id, m.author_kind) m.conversation_id, m.author_kind, m.author_user, m.author_name, m.body, m.created_at
       from conversation_messages m
       where m.created_at > $1::timestamptz - make_interval(days => $3::int)
         and ($2::uuid is null or m.conversation_id = $2)
       order by m.conversation_id, m.author_kind, m.created_at desc, m.id desc
     ),
     people as (
       -- parents of the child, told about the staff side's messages
       select c.id as conversation_id, g.id as recipient_id, 'parent' as side, g.auth_user_id as user_id, g.email, g.first_name,
         p.first_name as child, l.author_name as author, l.body, l.created_at, l.author_user
       from latest l
       join conversations c on c.id = l.conversation_id
       join players p on p.id = c.player_id
       join player_guardians pg on pg.player_id = c.player_id
       join guardians g on g.id = pg.guardian_id
       where l.author_kind = 'staff'
       union all
       -- staff, told about the parents' messages
       select c.id, s.id, 'staff', s.auth_user_id, s.email, split_part(s.display_name, ' ', 1),
         p.first_name, l.author_name, l.body, l.created_at, l.author_user
       from latest l
       join conversations c on c.id = l.conversation_id
       join players p on p.id = c.player_id
       join staff s on (
         case when c.staff_id is not null then s.id = c.staff_id
         when exists (select 1 from staff gc where gc.role = 'coach' and p.age_group = any (gc.age_groups))
           then s.role = 'coach' and p.age_group = any (s.age_groups)
         else s.role = 'admin' end
       )
       where l.author_kind = 'parent'
     )
     select x.conversation_id, x.recipient_id, x.side, x.user_id, x.email, x.first_name, x.child, x.author, x.body
     from people x
     left join conversation_reads r on r.conversation_id = x.conversation_id and r.user_id = x.user_id
     left join conversation_notices n on n.conversation_id = x.conversation_id and n.recipient_id = x.recipient_id
     where (x.user_id is null or x.author_user is null or x.user_id <> x.author_user)
       and x.created_at > coalesce(r.last_read_at, '-infinity')
       and x.created_at > coalesce(n.notified_at, '-infinity')
       and (n.notified_at is null or n.notified_at <= $1::timestamptz - make_interval(mins => $4::int))
     order by x.conversation_id, x.recipient_id`,
    [now, conversationId, NOTICE_MAX_AGE_DAYS, NOTICE_GAP_MINUTES],
  );
  return rows.map((r) => ({
    conversationId: r.conversation_id,
    recipientId: r.recipient_id,
    side: r.side,
    userId: r.user_id,
    email: r.email,
    firstName: r.first_name,
    child: r.child,
    author: r.author,
    body: r.body,
  }));
}

export type NoticeSenders = {
  /** Who has an app notification turned on. */
  pushUsers: (tx: Queryable) => Promise<Set<string>>;
  /** Sends one notification to these people's devices; returns the users reached. Missing: not set up. */
  push?: (tx: Queryable, userIds: string[], payload: { title: string; body: string; url: string }) => Promise<Set<string>>;
  /** Missing: email isn't set up. */
  email?: (emails: Email[]) => Promise<EmailReport>;
  /** The app's address for links in emails. */
  appUrl: string | null;
};

export const threadPath = (r: Pick<Recipient, "side" | "conversationId">) => (r.side === "staff" ? `/admin/messages/${r.conversationId}` : `/messages/${r.conversationId}`);

/**
 * Sends every due notification once and records it (per conversation and person), so the next is at least 15 minutes
 * later. Quiet hours send nothing. Holds an advisory lock so two runs can't notify the same person twice.
 */
export async function notifyMessages(tx: Queryable, now: Date, senders: NoticeSenders, conversationId: string | null = null): Promise<{ quiet: boolean; push: number; email: number }> {
  const result = { quiet: inQuietHours(now), push: 0, email: 0 };
  if (result.quiet) return result;
  await tx.query("select pg_advisory_xact_lock(727276)");
  const due = await dueNotices(tx, now, conversationId);
  if (due.length === 0) return result;
  const withPush = senders.push ? await senders.pushUsers(tx) : new Set<string>();
  const told: Recipient[] = [];

  for (const r of due.filter((d) => d.userId && withPush.has(d.userId))) {
    const reached = await senders.push!(tx, [r.userId!], {
      title: `${r.author} about ${r.child}`,
      // Never the message text: a lock screen can be seen by anyone, and staff may write about behaviour or health.
      body: "Open the app to read it.",
      url: threadPath(r),
    });
    if (reached.has(r.userId!)) told.push(r);
  }

  const byEmail = due.filter((d) => !(d.userId && withPush.has(d.userId)) && d.email);
  if (senders.email && senders.appUrl && byEmail.length) {
    const emails = byEmail.map((r) => ({
      r,
      email: messageEmail({ to: r.email!, firstName: r.firstName, author: r.author, child: r.child, toStaff: r.side === "staff", link: `${senders.appUrl}${threadPath(r)}`, appUrl: senders.appUrl }),
    }));
    const report = await senders.email(emails.map((e) => e.email));
    const went = new Set(report.sent);
    for (const e of emails) if (went.has(e.email)) told.push(e.r);
  }

  for (const r of told) {
    await tx.query(
      `insert into conversation_notices (conversation_id, recipient_id, notified_at) values ($1, $2, $3)
       on conflict (conversation_id, recipient_id) do update set notified_at = excluded.notified_at`,
      [r.conversationId, r.recipientId, now],
    );
  }
  result.push = told.filter((r) => r.userId && withPush.has(r.userId)).length;
  result.email = told.length - result.push;
  return result;
}
