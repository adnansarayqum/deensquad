import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { loadMediaFor, type MediaItem } from "../media/data";
import type { AgeGroup } from "../domain";
import { newsReaches } from "../squads/sql";
import { shortName } from "../admin/news-audience";

// Messages between parents and the club (migration 0025). Queries run inside asUser(), so row level security
// applies; each one also filters explicitly, because a parent who is also staff can read more than their family
// (parent queries go by the family's own child ids) and a member of staff who is also a parent can read their own
// family's conversations (staff queries go by `staff_covers` or being addressed, as the policy's staff part does).

import { mentionsHealth } from "./absence";
export { BODY_MAX, SUBJECT_MAX } from "./limits";
export const PREVIEW_LENGTH = 90;

export type AuthorKind = "parent" | "staff";

export type MessageView = { id: string; authorKind: AuthorKind; authorName: string; mine: boolean; body: string; at: string; media: MediaItem[] };

/** One line of a message for lists and notifications: whitespace folded, cut at a word near `max`. */
export function preview(body: string, max = PREVIEW_LENGTH): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** "Re: <news title>", the subject typed, else "Message about <child>". */
export function conversationTitle(c: { subject: string | null; newsTitle: string | null; childFirstName: string }): string {
  if (c.subject) return c.subject;
  if (c.newsTitle) return `Re: ${c.newsTitle}`;
  return `Message about ${c.childFirstName}`;
}

// Staff side: what a member of staff covers, mirroring the policy without its parent part.
// Since migration 0060 that is a child's whole family: a coach of any of a family's children reads its chat.
const STAFF_SEES = `(staff_covers_family(c.player_id) or (c.staff_id is not null and c.staff_id in (select id from staff where auth_user_id = auth.uid())))`;

// Parent side ------------------------------------------------------------------

export type ParentConversation = {
  id: string;
  childId: string;
  childFirstName: string;
  title: string;
  /** Who it's with: the member of staff it's addressed to, else "the coaches". */
  withName: string | null;
  last: { authorKind: AuthorKind; authorName: string; mine: boolean; preview: string } | null;
  lastAt: string;
  unread: boolean;
};

export async function loadParentConversations(tx: Queryable, childIds: readonly string[]): Promise<ParentConversation[]> {
  if (childIds.length === 0) return [];
  const rows = await tx.query<{
    id: string;
    player_id: string;
    child: string;
    subject: string | null;
    news_title: string | null;
    with_name: string | null;
    author_kind: AuthorKind | null;
    author_name: string | null;
    author_user: string | null;
    body: string | null;
    last_message_at: Date;
    unread: boolean;
  }>(
    `select c.id, c.player_id, p.first_name as child, c.subject, a.title as news_title, sn.display_name as with_name,
       m.author_kind, m.author_name, m.author_user, m.body, c.last_message_at,
       exists (
         select 1 from conversation_messages s where s.conversation_id = c.id and s.author_kind = 'staff'
           and s.created_at > coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')
       ) as unread
     from conversations c
     join players p on p.id = c.player_id
     left join announcements a on a.id = c.announcement_id
     left join staff_names sn on sn.id = c.staff_id
     left join lateral (
       select author_kind, author_name, author_user, body from conversation_messages
       where conversation_id = c.id order by created_at desc, id desc limit 1
     ) m on true
     where c.player_id = any ($1::uuid[])
     order by c.last_message_at desc
     limit 100`,
    [childIds],
  );
  const me = await currentUser(tx);
  return rows.map((r) => ({
    id: r.id,
    childId: r.player_id,
    childFirstName: r.child,
    title: conversationTitle({ subject: r.subject, newsTitle: r.news_title, childFirstName: r.child }),
    withName: r.with_name,
    last:
      r.author_kind && r.body !== null
        ? { authorKind: r.author_kind, authorName: r.author_name ?? "", mine: r.author_user === me, preview: preview(r.body) }
        : null,
    lastAt: iso(r.last_message_at),
    unread: r.unread,
  }));
}

/** How many messages from the club this person hasn't read yet, across their children's conversations. */
export async function loadParentUnreadMessages(tx: Queryable, childIds: readonly string[]): Promise<number> {
  if (childIds.length === 0) return 0;
  const [{ n }] = await tx.query<{ n: number }>(
    `select count(*)::int as n from conversation_messages m join conversations c on c.id = m.conversation_id
     where c.player_id = any ($1::uuid[]) and m.author_kind = 'staff'
       and m.created_at > coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')`,
    [childIds],
  );
  return n;
}

async function currentUser(tx: Queryable): Promise<string | null> {
  const [row] = await tx.query<{ id: string | null }>(`select auth.uid() as id`);
  return row?.id ?? null;
}

export type Thread = {
  id: string;
  child: { id: string; firstName: string; lastName: string; ageGroup: AgeGroup };
  title: string;
  newsId: string | null;
  /** The club message this conversation replies to, shown at the top so the reply has its context. */
  news: { title: string; body: string; postedBy: string | null; postedAt: string } | null;
  /** The member of staff it's addressed to (null: the child's coaches). */
  withName: string | null;
  parents: { id: string; name: string }[];
  messages: MessageView[];
  /** A member of staff who has read it since the parents' latest message ("Seen by Coach Javed"), else null. */
  seenBy: string | null;
  /** Addressed to the club's admins rather than the coaches. */
  forAdmins: boolean;
};

/**
 * One conversation with its messages, for a parent (`side: "parent"`, only their own children's, by `childIds`) or a
 * member of staff (only one they cover or that's addressed to them). Null when it isn't there or isn't theirs.
 */
export async function loadThread(tx: Queryable, id: string, side: { parent: readonly string[] } | "staff"): Promise<Thread | null> {
  const [c] = await tx.query<{
    id: string;
    player_id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    subject: string | null;
    news_title: string | null;
    news_body: string | null;
    news_by: string | null;
    news_at: Date | null;
    announcement_id: string | null;
    with_name: string | null;
    seen_by: string | null;
    for_admins: boolean;
  }>(
    `select c.id, c.player_id, p.first_name, p.last_name, p.age_group::text as age_group, c.subject, a.title as news_title,
       a.body as news_body, (select display_name from staff_names where id = a.posted_by) as news_by, a.posted_at as news_at,
       c.announcement_id, sn.display_name as with_name, conversation_seen_by(c.id) as seen_by, c.for_admins
     from conversations c join players p on p.id = c.player_id
     left join announcements a on a.id = c.announcement_id
     left join staff_names sn on sn.id = c.staff_id
     where c.id = $1 and ${side === "staff" ? STAFF_SEES : "c.player_id = any ($2::uuid[])"}`,
    side === "staff" ? [id] : [id, side.parent],
  );
  if (!c) return null;
  const me = await currentUser(tx);
  const messages = await tx.query<{ id: string; author_kind: AuthorKind; author_name: string; author_user: string | null; body: string; created_at: Date }>(
      `select id, author_kind, author_name, author_user, body, created_at from conversation_messages where conversation_id = $1 order by created_at, id`,
      [id],
  );
  const media = await loadMediaFor(tx, "message", messages.map((m) => m.id));
  const parents = await tx.query<{ id: string; first_name: string; last_name: string }>(
    `select g.id, g.first_name, g.last_name from guardians g join player_guardians pg on pg.guardian_id = g.id where pg.player_id = $1 order by g.first_name`,
    [c.player_id],
  );
  return {
    id: c.id,
    child: { id: c.player_id, firstName: c.first_name, lastName: c.last_name, ageGroup: c.age_group },
    title: conversationTitle({ subject: c.subject, newsTitle: c.news_title, childFirstName: c.first_name }),
    newsId: c.announcement_id,
    news:
      c.news_title !== null && c.news_at !== null
        ? { title: c.news_title, body: c.news_body ?? "", postedBy: c.news_by, postedAt: iso(c.news_at) }
        : null,
    withName: c.with_name,
    seenBy: c.seen_by,
    forAdmins: c.for_admins,
    parents: parents.map((g) => ({ id: g.id, name: `${g.first_name} ${g.last_name}` })),
    messages: messages.map((m) => ({
      id: m.id,
      authorKind: m.author_kind,
      authorName: m.author_name,
      mine: m.author_user !== null && m.author_user === me,
      body: m.body,
      at: iso(m.created_at),
      media: media.get(m.id) ?? [],
    })),
  };
}

/** Marks a conversation read up to now for the signed-in person (only one they can see; the policy checks). */
export async function markRead(tx: Queryable, conversationId: string): Promise<void> {
  await tx.query(
    `insert into conversation_reads (conversation_id, user_id, last_read_at) values ($1, auth.uid(), now())
     on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at`,
    [conversationId],
  );
}

/** Adds a message to a conversation as the signed-in person. The database fills in their name and the time. */
export async function addMessage(tx: Queryable, conversationId: string, kind: AuthorKind, body: string): Promise<string> {
  const [row] = await tx.query<{ id: string }>(
    `insert into conversation_messages (conversation_id, author_user, author_kind, author_name, body) values ($1, auth.uid(), $2, '', $3) returning id`,
    [conversationId, kind, body],
  );
  await markRead(tx, conversationId);
  return row.id;
}

/** A club message a parent may reply to about this child: it lets parents reply and it reaches the child. */
export type ReplyTarget = { id: string; title: string; postedBy: string | null; postedById: string | null };

export async function loadReplyTarget(tx: Queryable, announcementId: string, childId: string, childIds: readonly string[]): Promise<ReplyTarget | null> {
  if (!childIds.includes(childId)) return null;
  const [row] = await tx.query<{ id: string; title: string; posted_by: string | null; posted_by_id: string | null }>(
    `select a.id, a.title, sn.display_name as posted_by, a.posted_by as posted_by_id
     from announcements a join players p on p.id = $2
     left join staff_names sn on sn.id = a.posted_by
     where a.id = $1 and a.allow_replies and ${newsReaches("a", "p")}`,
    [announcementId, childId],
  );
  return row ? { id: row.id, title: row.title, postedBy: row.posted_by, postedById: row.posted_by_id } : null;
}

/** The family's existing reply thread about a message and a child, if one of its parents started it. */
export async function findReplyThread(tx: Queryable, announcementId: string, childId: string): Promise<string | null> {
  const [row] = await tx.query<{ id: string }>(`select id from conversations where announcement_id = $1 and player_id = $2`, [announcementId, childId]);
  return row?.id ?? null;
}

/**
 * Starts a conversation as a parent about one of their children (checked by the caller and the policy), with its
 * first message. A reply to club news is addressed to whoever posted it and joins the existing thread for that
 * message and child if there is one (two parents replying at once land in the same thread).
 */
export async function startParentConversation(
  tx: Queryable,
  opts: { childId: string; subject: string | null; body: string; reply: ReplyTarget | null; /** For the club's admins, not the coaches. */ forAdmins?: boolean },
): Promise<string> {
  let id: string | null = null;
  if (opts.reply) {
    const [row] = await tx.query<{ id: string }>(
      `insert into conversations (player_id, announcement_id, started_by_user, started_by_kind, staff_id)
       values ($1, $2, auth.uid(), 'parent', $3)
       on conflict (announcement_id, player_id) where announcement_id is not null do nothing returning id`,
      [opts.childId, opts.reply.id, opts.reply.postedById],
    );
    id = row?.id ?? (await findReplyThread(tx, opts.reply.id, opts.childId));
  } else {
    const [row] = await tx.query<{ id: string }>(
      `insert into conversations (player_id, started_by_user, started_by_kind, subject, for_admins) values ($1, auth.uid(), 'parent', $2, $3) returning id`,
      [opts.childId, opts.subject, Boolean(opts.forAdmins)],
    );
    id = row.id;
  }
  if (!id) throw new Error("conversation not found");
  await addMessage(tx, id, "parent", opts.body);
  return id;
}

// Staff side -------------------------------------------------------------------

export type InboxRow = {
  id: string;
  child: { id: string; firstName: string; lastName: string; ageGroup: AgeGroup };
  parents: string[];
  title: string;
  withName: string | null;
  last: { authorKind: AuthorKind; authorName: string; preview: string } | null;
  lastAt: string;
  unread: boolean;
  /** A "not coming" reason that mentions an injury or illness (`mentionsHealth`). */
  health: boolean;
  /** Addressed to the club's admins (payments, the shop, the account) rather than the coaches. */
  forAdmins: boolean;
};

/**
 * The staff inbox: conversations this member of staff covers or that are addressed to them, newest first.
 * `unreadOnly` ("Needs reply"): a parent's message they haven't read, leaving out "Not coming" reasons (those are
 * listed under `absences` and show on the register; admin UX review, Oct 2026: they were most of the unread count).
 * `about`: replies to one club message.
 */
export async function loadInbox(
  tx: Queryable,
  opts: { unreadOnly?: boolean; about?: string | null; limit?: number; absences?: boolean; sent?: boolean; /** Leave out replies to posts (listed by post, `loadReplyGroups`) and "not coming" reasons. */ direct?: boolean } = {},
): Promise<InboxRow[]> {
  const rows = await tx.query<{
    id: string;
    player_id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    parents: string[] | null;
    subject: string | null;
    news_title: string | null;
    with_name: string | null;
    author_kind: AuthorKind | null;
    author_name: string | null;
    body: string | null;
    last_message_at: Date;
    unread: boolean;
    reason: string | null;
    for_admins: boolean;
  }>(
    `select * from (
       select c.id, c.player_id, p.first_name, p.last_name, p.age_group::text as age_group,
         (select array_agg(g.first_name || ' ' || g.last_name order by g.first_name) from player_guardians pg join guardians g on g.id = pg.guardian_id where pg.player_id = c.player_id) as parents,
         c.subject, a.title as news_title, sn.display_name as with_name, m.author_kind, m.author_name, m.body, c.last_message_at,
         exists (
           select 1 from conversation_messages pm where pm.conversation_id = c.id and pm.author_kind = 'parent'
             and pm.created_at > coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')
         ) as unread,
         c.session_id is not null as absence, c.announcement_id is not null as reply, c.for_admins,
         case when c.session_id is not null then (select fm.body from conversation_messages fm where fm.conversation_id = c.id and fm.author_kind = 'parent' order by fm.created_at, fm.id limit 1) end as reason
       from conversations c
       join players p on p.id = c.player_id
       left join announcements a on a.id = c.announcement_id
       left join staff_names sn on sn.id = c.staff_id
       left join lateral (
         select author_kind, author_name, body from conversation_messages where conversation_id = c.id order by created_at desc, id desc limit 1
       ) m on true
       where ${STAFF_SEES} and ($1::uuid is null or c.announcement_id = $1) and (not $4 or c.session_id is not null)
     ) x
     where (not $2 or (x.unread and not x.absence))
       and (not $5 or (x.author_kind = 'staff' and not x.absence))
       and (not $6 or (not x.absence and not x.reply))
     order by x.last_message_at desc
     limit $3`,
    [opts.about ?? null, Boolean(opts.unreadOnly), opts.limit ?? 200, Boolean(opts.absences), Boolean(opts.sent), Boolean(opts.direct)],
  );
  const list = rows.map((r) => ({
    id: r.id,
    child: { id: r.player_id, firstName: r.first_name, lastName: r.last_name, ageGroup: r.age_group },
    parents: r.parents ?? [],
    title: conversationTitle({ subject: r.subject, newsTitle: r.news_title, childFirstName: r.first_name }),
    withName: r.with_name,
    last: r.author_kind && r.body !== null ? { authorKind: r.author_kind, authorName: r.author_name ?? "", preview: preview(r.body) } : null,
    lastAt: iso(r.last_message_at),
    unread: r.unread,
    health: mentionsHealth(r.reason),
    forAdmins: r.for_admins,
  }));
  // Not coming: unread reasons that mention an injury or illness first, so they aren't lost among the weather.
  if (opts.absences) list.sort((a, b) => Number(b.unread && b.health) - Number(a.unread && a.health));
  return list;
}

export type ReplyGroup = { newsId: string; title: string; replies: number; unread: number; lastAt: string };

/**
 * Replies to club posts, gathered by post (messaging review, 23 Nov 2026: one post's 56 "all good" replies were 56
 * rows in the inbox): how many conversations reply to each, how many have a parent's message this person hasn't
 * read, newest first. Only conversations this member of staff can see.
 */
export async function loadReplyGroups(tx: Queryable, opts: { unreadOnly?: boolean } = {}): Promise<ReplyGroup[]> {
  const rows = await tx.query<{ news_id: string; title: string; replies: number; unread: number; last_at: Date }>(
    `select a.id as news_id, a.title, count(*)::int as replies, max(c.last_message_at) as last_at,
       count(*) filter (where exists (
         select 1 from conversation_messages pm where pm.conversation_id = c.id and pm.author_kind = 'parent'
           and pm.created_at > coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')
       ))::int as unread
     from conversations c join announcements a on a.id = c.announcement_id
     where ${STAFF_SEES}
     group by a.id, a.title
     order by max(c.last_message_at) desc
     limit 100`,
  );
  return rows
    .filter((r) => !opts.unreadOnly || r.unread > 0)
    .map((r) => ({ newsId: r.news_id, title: r.title, replies: r.replies, unread: r.unread, lastAt: iso(r.last_at) }));
}

/**
 * Staff have seen a session's "not coming" reasons on its register: marks those threads read for this person, so
 * parents get "Seen by …" without anyone typing a reply. Only threads with something new, for children they cover.
 */
export async function markAbsencesSeen(tx: Queryable, sessionId: string, playerIds: readonly string[]): Promise<void> {
  if (!playerIds.length) return;
  await tx.query(
    `insert into conversation_reads (conversation_id, user_id, last_read_at)
     select c.id, auth.uid(), now() from conversations c
     where c.session_id = $1 and c.player_id = any ($2::uuid[]) and ${STAFF_SEES} and auth.uid() is not null
       and c.last_message_at > coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')
     on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at`,
    [sessionId, [...playerIds]],
  );
}

/**
 * The nav badge: conversations in this member of staff's inbox with a parent's message they haven't read, leaving out
 * "Not coming" reasons (`absences: true` counts only those, for the Not coming tab).
 */
export async function loadStaffUnread(tx: Queryable, opts: { absences?: boolean } = {}): Promise<number> {
  const unread = `exists (
         select 1 from conversation_messages pm where pm.conversation_id = c.id and pm.author_kind = 'parent'
           and pm.created_at > coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')
       )`;
  if (opts.absences) {
    const [{ n }] = await tx.query<{ n: number }>(`select count(*)::int as n from conversations c where ${STAFF_SEES} and c.session_id is not null and ${unread}`);
    return n;
  }
  // Conversations one by one, and replies to posts once per post (as the inbox lists them).
  const [{ n }] = await tx.query<{ n: number }>(
    `select (select count(*) from conversations c where ${STAFF_SEES} and c.session_id is null and c.announcement_id is null and ${unread})::int
          + (select count(distinct c.announcement_id) from conversations c where ${STAFF_SEES} and c.session_id is null and c.announcement_id is not null and ${unread})::int as n`,
  );
  return n;
}

/** How many conversations reply to a club message (those this member of staff can see), for its detail page. */
export async function countReplies(tx: Queryable, announcementId: string): Promise<number> {
  const [{ n }] = await tx.query<{ n: number }>(`select count(*)::int as n from conversations c where c.announcement_id = $1 and ${STAFF_SEES}`, [announcementId]);
  return n;
}

export type MessageChild = { id: string; firstName: string; lastName: string; ageGroup: AgeGroup; parents: string[] };

/** A child a member of staff may start a conversation about: any for admins (`mine` null), else one in their groups. */
export async function loadMessageChild(tx: Queryable, childId: string, mine: readonly AgeGroup[] | null): Promise<MessageChild | null> {
  const [row] = await tx.query<{ id: string; first_name: string; last_name: string; age_group: AgeGroup; parents: string[] | null }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group,
       (select array_agg(g.first_name || ' ' || g.last_name order by g.first_name) from player_guardians pg join guardians g on g.id = pg.guardian_id where pg.player_id = p.id) as parents
     from players p where p.id = $1 and ($2::text[] is null or p.age_group::text = any ($2::text[])) and staff_covers(p.id)`,
    [childId, mine ? [...mine] : null],
  );
  return row ? { id: row.id, firstName: row.first_name, lastName: row.last_name, ageGroup: row.age_group, parents: row.parents ?? [] } : null;
}

/** Starts a conversation as a member of staff with a child's family, addressed to themselves (so replies come back to them). */
export async function startStaffConversation(tx: Queryable, opts: { childId: string; staffId: string; subject: string | null; body: string }): Promise<string> {
  const [row] = await tx.query<{ id: string }>(
    `insert into conversations (player_id, started_by_user, started_by_kind, staff_id, subject) values ($1, auth.uid(), 'staff', $2, $3) returning id`,
    [opts.childId, opts.staffId, opts.subject],
  );
  await addMessage(tx, row.id, "staff", opts.body);
  return row.id;
}

/**
 * A club message's quick answers for its detail page: its options, whether it takes replies, and every child it
 * reaches (with a parent to answer; a group coach's own groups only, as the unread list) with their answer or null.
 */
export async function loadNewsAnswers(
  tx: Queryable,
  announcementId: string,
  groups: readonly AgeGroup[] | null,
): Promise<{ options: string[] | null; allowReplies: boolean; children: { name: string; answer: string | null }[] } | null> {
  const [a] = await tx.query<{ quick_answers: string[] | null; allow_replies: boolean }>(`select quick_answers, allow_replies from announcements where id = $1`, [announcementId]);
  if (!a) return null;
  if (!a.quick_answers) return { options: null, allowReplies: a.allow_replies, children: [] };
  const rows = await tx.query<{ first_name: string; last_name: string; answer: string | null }>(
    `select p.first_name, p.last_name, aa.answer
     from announcements a join players p on ${newsReaches("a", "p")}
     left join announcement_answers aa on aa.announcement_id = a.id and aa.player_id = p.id
     where a.id = $1 and ($2::text[] is null or p.age_group::text = any ($2::text[]))
       and exists (select 1 from player_guardians pg where pg.player_id = p.id)
     order by p.first_name, p.last_name`,
    [announcementId, groups ? [...groups] : null],
  );
  return {
    options: a.quick_answers,
    allowReplies: a.allow_replies,
    children: rows.map((r) => ({ name: shortName(r.first_name, r.last_name), answer: r.answer })),
  };
}

// One chat per family (migration 0060) ------------------------------------------
//
// The club's decision (26 Nov 2026): messaging should work like WhatsApp, one continuous chat with each family.
// Conversations stay as they are underneath (a topic, a reply to a post, a "not coming" reason; each about one
// child, which decides who is told); a family's chat is all of them as one timeline, oldest first. A new message
// carries on the conversation the chat's latest message is in, so an answer always lands beside what it answers.

/** What a message in the chat belongs to, said above it when it changes: a post it replies to, a session, a subject. */
export type ChatContext = { kind: "direct" | "reply" | "absence"; label: string | null; child: string; newsId: string | null };

export type ChatMessage = MessageView & { conversationId: string; context: ChatContext };

export type FamilyChat = {
  /** A child of the family: what the staff side's address and forms carry. */
  key: string;
  children: { id: string; firstName: string; lastName: string; ageGroup: AgeGroup }[];
  parents: { id: string; name: string }[];
  messages: ChatMessage[];
  /** Older messages there wasn't room for (the chat shows the latest `CHAT_LIMIT`). */
  earlier: number;
  /** The first message from the other side this person hadn't read when they opened it ("New" above it). */
  firstNew: string | null;
  /** The child the latest message is about: what a new message is about unless they choose another. */
  about: string | null;
  /** Parent side: a member of staff has read the parents' latest message. */
  seenBy: string | null;
};

export const CHAT_LIMIT = 300;

type ChatSide = { parent: readonly string[] } | { staff: string };

/** The conversations a chat is made of: a parent's own children's, or (staff) a family's that this person can read. */
async function chatConversations(tx: Queryable, side: ChatSide) {
  const where =
    "parent" in side
      ? `c.player_id = any ($1::uuid[])`
      : `c.player_id in (select f.player_id from player_families() f where f.family_id = (select g.family_id from player_families() g where g.player_id = $1)) and ${STAFF_SEES}`;
  return tx.query<{
    id: string;
    player_id: string;
    child: string;
    subject: string | null;
    absence: boolean;
    announcement_id: string | null;
    news_title: string | null;
    last_message_at: Date;
    last_read_at: Date | null;
    last_by: AuthorKind | null;
  }>(
    `select c.id, c.player_id, p.first_name as child, c.subject, c.session_id is not null as absence, c.announcement_id, a.title as news_title,
       c.last_message_at, (select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()) as last_read_at,
       (select m.author_kind from conversation_messages m where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) as last_by
     from conversations c join players p on p.id = c.player_id
     left join announcements a on a.id = c.announcement_id
     where ${where}
     order by c.last_message_at desc, c.id`,
    ["parent" in side ? [...side.parent] : side.staff],
  );
}

/**
 * A family's chat with the club. Parent side: their own children (`parent`: the family's child ids). Staff side:
 * the family of `staff` (a child's id), with the conversations this member of staff can read; null when the child
 * isn't one they cover (or isn't there).
 */
export async function loadFamilyChat(tx: Queryable, side: ChatSide): Promise<FamilyChat | null> {
  const staffSide = "staff" in side;
  const children = await tx.query<{ id: string; first_name: string; last_name: string; age_group: AgeGroup }>(
    staffSide
      ? `select p.id, p.first_name, p.last_name, p.age_group::text as age_group from players p
         where p.id in (select f.player_id from player_families() f where f.family_id = (select g.family_id from player_families() g where g.player_id = $1))
           and staff_covers_family(p.id)
         order by p.date_of_birth nulls last, p.first_name`
      : `select p.id, p.first_name, p.last_name, p.age_group::text as age_group from players p where p.id = any ($1::uuid[]) order by p.date_of_birth nulls last, p.first_name`,
    [staffSide ? side.staff : [...side.parent]],
  );
  if (staffSide && children.length === 0) return null;
  const childIds = children.map((c) => c.id);
  const parents = childIds.length
    ? await tx.query<{ id: string; first_name: string; last_name: string }>(
        `select distinct g.id, g.first_name, g.last_name from guardians g join player_guardians pg on pg.guardian_id = g.id where pg.player_id = any ($1::uuid[]) order by g.first_name, g.last_name`,
        [childIds],
      )
    : [];
  const conversations = childIds.length ? await chatConversations(tx, side) : [];
  const byId = new Map(conversations.map((c) => [c.id, c]));
  const ids = conversations.map((c) => c.id);
  const rows = ids.length
    ? await tx.query<{ id: string; conversation_id: string; author_kind: AuthorKind; author_name: string; author_user: string | null; body: string; created_at: Date; total: number }>(
        `select * from (
           select id, conversation_id, author_kind, author_name, author_user, body, created_at, count(*) over ()::int as total
           from conversation_messages where conversation_id = any ($1::uuid[]) order by created_at desc, id desc limit $2
         ) latest order by created_at, id`,
        [ids, CHAT_LIMIT],
      )
    : [];
  const me = await currentUser(tx);
  const media = await loadMediaFor(tx, "message", rows.map((m) => m.id));
  const other: AuthorKind = staffSide ? "parent" : "staff";
  const firstNew = rows.find((m) => {
    const read = byId.get(m.conversation_id)?.last_read_at;
    return m.author_kind === other && (!read || m.created_at > read);
  });
  const last = rows.at(-1);
  const [seen] =
    !staffSide && last?.author_kind === "parent" ? await tx.query<{ by: string | null }>(`select conversation_seen_by($1) as by`, [last.conversation_id]) : [];
  return {
    key: staffSide ? side.staff : (childIds[0] ?? ""),
    children: children.map((c) => ({ id: c.id, firstName: c.first_name, lastName: c.last_name, ageGroup: c.age_group })),
    parents: parents.map((g) => ({ id: g.id, name: `${g.first_name} ${g.last_name}` })),
    messages: rows.map((m) => {
      const c = byId.get(m.conversation_id)!;
      return {
        id: m.id,
        conversationId: m.conversation_id,
        authorKind: m.author_kind,
        authorName: m.author_name,
        mine: m.author_user !== null && m.author_user === me,
        body: m.body,
        at: iso(m.created_at),
        media: media.get(m.id) ?? [],
        context: {
          kind: c.absence ? "absence" : c.announcement_id ? "reply" : "direct",
          label: c.absence ? c.subject : c.news_title ? `Replying to “${c.news_title}”` : c.announcement_id ? "Replying to a post that has been deleted" : c.subject,
          child: c.child,
          newsId: c.announcement_id,
        },
      };
    }),
    earlier: rows.length ? rows[0].total - rows.length : 0,
    firstNew: firstNew?.id ?? null,
    about: last ? (byId.get(last.conversation_id)?.player_id ?? null) : null,
    seenBy: seen?.by ?? null,
  };
}

/** Opening a chat reads it: every conversation in it with something newer than this person's mark. */
export async function markChatRead(tx: Queryable, side: ChatSide): Promise<void> {
  const conversations = await chatConversations(tx, side);
  const stale = conversations.filter((c) => !c.last_read_at || c.last_message_at > c.last_read_at).map((c) => c.id);
  if (!stale.length) return;
  await tx.query(
    `insert into conversation_reads (conversation_id, user_id, last_read_at) select id, auth.uid(), now() from unnest($1::uuid[]) as id where auth.uid() is not null
     on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at`,
    [stale],
  );
}

/**
 * Where a new message in a chat goes: the conversation its latest message is in, unless the writer chose another
 * child (`about`), which uses that child's latest plain conversation (not a post reply or a "not coming" reason).
 * A parent who writes again after their own "not coming" reason isn't adding to the reason (it would show on the
 * register): that goes to the child's plain conversation too. Staff answering the reason stay with it.
 * Null when there's nowhere yet; `{ child }` when the caller should start a conversation about that child.
 */
export async function chatThread(tx: Queryable, side: ChatSide, about: string | null): Promise<{ conversationId: string } | { child: string } | null> {
  const conversations = await chatConversations(tx, side);
  const latest = conversations[0];
  if (!latest && !about) return null;
  const ownReason = latest && "parent" in side && latest.absence && latest.last_by === "parent";
  if (latest && !ownReason && (!about || about === latest.player_id)) return { conversationId: latest.id };
  const child = about ?? latest.player_id;
  const plain = conversations.find((c) => c.player_id === child && !c.absence && !c.announcement_id);
  return plain ? { conversationId: plain.id } : { child };
}

export type ChatRow = {
  /** A child of the family (the smallest id): the chat's address. */
  key: string;
  children: { id: string; firstName: string; lastName: string; ageGroup: AgeGroup }[];
  parents: string[];
  last: { authorKind: AuthorKind; authorName: string; preview: string } | null;
  lastAt: string;
  /** Parents' messages this person hasn't read, leaving out "not coming" reasons (those have their own tab and the register). */
  unread: number;
  /** A new message for the club's admins (payments, the shop, the account). */
  forAdmins: boolean;
};

/** The staff inbox as chats: one row per family with a conversation this person can read, latest message first. */
export async function loadChats(tx: Queryable, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<ChatRow[]> {
  const rows = await tx.query<{
    family_id: string;
    last_at: Date;
    unread: number;
    for_admins: boolean;
    author_kind: AuthorKind | null;
    author_name: string | null;
    body: string | null;
  }>(
    `with conv as (
       select c.id, f.family_id, c.last_message_at, c.for_admins, c.session_id is not null as absence,
         coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity') as read_at
       from conversations c join player_families() f on f.player_id = c.player_id
       where ${STAFF_SEES}
     ),
     fam as (
       select conv.family_id, max(conv.last_message_at) as last_at,
         coalesce(sum((select count(*) from conversation_messages pm where pm.conversation_id = conv.id and pm.author_kind = 'parent' and pm.created_at > conv.read_at)) filter (where not conv.absence), 0)::int as unread,
         coalesce(bool_or(conv.for_admins and exists (select 1 from conversation_messages pm where pm.conversation_id = conv.id and pm.author_kind = 'parent' and pm.created_at > conv.read_at)), false) as for_admins
       from conv group by conv.family_id
     )
     select fam.family_id, fam.last_at, fam.unread, fam.for_admins, m.author_kind, m.author_name, m.body
     from fam
     left join lateral (
       select cm.author_kind, cm.author_name, cm.body from conversation_messages cm join conv on conv.id = cm.conversation_id
       where conv.family_id = fam.family_id order by cm.created_at desc, cm.id desc limit 1
     ) m on true
     where (not $1 or fam.unread > 0)
     order by fam.last_at desc
     limit $2`,
    [Boolean(opts.unreadOnly), opts.limit ?? 200],
  );
  if (!rows.length) return [];
  const families = rows.map((r) => r.family_id);
  const children = await tx.query<{ family_id: string; id: string; first_name: string; last_name: string; age_group: AgeGroup }>(
    `select f.family_id, p.id, p.first_name, p.last_name, p.age_group::text as age_group from players p join player_families() f on f.player_id = p.id
     where f.family_id = any ($1::uuid[]) order by p.date_of_birth nulls last, p.first_name`,
    [families],
  );
  const parents = await tx.query<{ family_id: string; name: string }>(
    `select distinct f.family_id, g.first_name || ' ' || g.last_name as name from player_families() f
     join player_guardians pg on pg.player_id = f.player_id join guardians g on g.id = pg.guardian_id
     where f.family_id = any ($1::uuid[]) order by name`,
    [families],
  );
  return rows.map((r) => ({
    key: r.family_id,
    children: children.filter((c) => c.family_id === r.family_id).map((c) => ({ id: c.id, firstName: c.first_name, lastName: c.last_name, ageGroup: c.age_group })),
    parents: parents.filter((p) => p.family_id === r.family_id).map((p) => p.name),
    last: r.author_kind && r.body !== null ? { authorKind: r.author_kind, authorName: r.author_name ?? "", preview: preview(r.body) } : null,
    lastAt: iso(r.last_at),
    unread: r.unread,
    forAdmins: r.for_admins,
  }));
}

/** The child a conversation is about, if this person can read it: where its old address sends them (the family's chat). */
export async function conversationChild(tx: Queryable, id: string, side: { parent: readonly string[] } | "staff"): Promise<string | null> {
  const [row] = await tx.query<{ player_id: string }>(
    `select c.player_id from conversations c where c.id = $1 and ${side === "staff" ? STAFF_SEES : "c.player_id = any ($2::uuid[])"}`,
    side === "staff" ? [id] : [id, [...side.parent]],
  );
  return row?.player_id ?? null;
}
