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
const STAFF_SEES = `(staff_covers(c.player_id) or (c.staff_id is not null and c.staff_id in (select id from staff where auth_user_id = auth.uid())))`;

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
  }>(
    `select c.id, c.player_id, p.first_name, p.last_name, p.age_group::text as age_group, c.subject, a.title as news_title,
       a.body as news_body, (select display_name from staff_names where id = a.posted_by) as news_by, a.posted_at as news_at,
       c.announcement_id, sn.display_name as with_name
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
  opts: { childId: string; subject: string | null; body: string; reply: ReplyTarget | null },
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
      `insert into conversations (player_id, started_by_user, started_by_kind, subject) values ($1, auth.uid(), 'parent', $2) returning id`,
      [opts.childId, opts.subject],
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
};

/**
 * The staff inbox: conversations this member of staff covers or that are addressed to them, newest first.
 * `unreadOnly`: only those with a parent's message they haven't read. `about`: replies to one club message.
 */
export async function loadInbox(
  tx: Queryable,
  opts: { unreadOnly?: boolean; about?: string | null; limit?: number; absences?: boolean } = {},
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
  }>(
    `select * from (
       select c.id, c.player_id, p.first_name, p.last_name, p.age_group::text as age_group,
         (select array_agg(g.first_name || ' ' || g.last_name order by g.first_name) from player_guardians pg join guardians g on g.id = pg.guardian_id where pg.player_id = c.player_id) as parents,
         c.subject, a.title as news_title, sn.display_name as with_name, m.author_kind, m.author_name, m.body, c.last_message_at,
         exists (
           select 1 from conversation_messages pm where pm.conversation_id = c.id and pm.author_kind = 'parent'
             and pm.created_at > coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')
         ) as unread
       from conversations c
       join players p on p.id = c.player_id
       left join announcements a on a.id = c.announcement_id
       left join staff_names sn on sn.id = c.staff_id
       left join lateral (
         select author_kind, author_name, body from conversation_messages where conversation_id = c.id order by created_at desc, id desc limit 1
       ) m on true
       where ${STAFF_SEES} and ($1::uuid is null or c.announcement_id = $1) and (not $4 or c.session_id is not null)
     ) x
     where not $2 or x.unread
     order by x.last_message_at desc
     limit $3`,
    [opts.about ?? null, Boolean(opts.unreadOnly), opts.limit ?? 200, Boolean(opts.absences)],
  );
  return rows.map((r) => ({
    id: r.id,
    child: { id: r.player_id, firstName: r.first_name, lastName: r.last_name, ageGroup: r.age_group },
    parents: r.parents ?? [],
    title: conversationTitle({ subject: r.subject, newsTitle: r.news_title, childFirstName: r.first_name }),
    withName: r.with_name,
    last: r.author_kind && r.body !== null ? { authorKind: r.author_kind, authorName: r.author_name ?? "", preview: preview(r.body) } : null,
    lastAt: iso(r.last_message_at),
    unread: r.unread,
  }));
}

/** How many conversations in this member of staff's inbox have a parent's message they haven't read (the nav badge). */
export async function loadStaffUnread(tx: Queryable): Promise<number> {
  const [{ n }] = await tx.query<{ n: number }>(
    `select count(*)::int as n from conversations c
     where ${STAFF_SEES}
       and exists (
         select 1 from conversation_messages pm where pm.conversation_id = c.id and pm.author_kind = 'parent'
           and pm.created_at > coalesce((select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')
       )`,
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
