import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, PenLine, Users } from "lucide-react";
import { Notice, PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { postedLabel } from "@/lib/dates";
import { markAllRead } from "@/lib/messages/actions";
import { familyInitials, familyName } from "@/lib/messages/family-name";
import { loadChats, loadStaffUnread, loadInbox, loadReplyGroups, type ChatRow, type InboxRow } from "@/lib/messages/data";

export const metadata: Metadata = { title: "Inbox" };

/**
 * The staff inbox, like a messaging app (26 Nov 2026): one chat per family, the latest message first, with how many
 * of the family's messages this person hasn't read. Families whose children they cover (every family for admins).
 * "Unread" narrows it to those; Not coming and Replies to posts are the same messages gathered for working through
 * (`?about=<news>` lists the replies to one post). Each row opens the family's chat.
 */
export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const user = await requireStaff();
  const params = await searchParams;
  const about = typeof params.about === "string" && UUID.test(params.about) ? params.about : null;
  const absences = params.show === "absences" && !about;
  const replies = params.show === "replies" && !about;
  const unread = params.show === "unread" && !about;
  const chatsTab = !about && !absences && !replies;
  const [chats, rows, newsTitle, newAbsences, groups, waiting] = await asUser(user.id, async (tx) => {
    const families = chatsTab ? await loadChats(tx, { unreadOnly: unread }) : [];
    const list = about || absences ? await loadInbox(tx, { about, absences }) : [];
    const [news] = about ? await tx.query<{ title: string }>(`select title from announcements where id = $1`, [about]) : [];
    const byPost = replies ? await loadReplyGroups(tx) : [];
    const count = chatsTab && !unread ? families.filter((f) => f.unread > 0).length : (await loadChats(tx, { unreadOnly: true })).length;
    return [families, list, news?.title ?? null, await loadStaffUnread(tx, { absences: true }), byPost, count] as const;
  });
  const healthNew = absences ? rows.filter((r) => r.unread && r.health).length : 0;
  const confirming = params.markall === "confirm";
  const now = new Date();
  const tab = (active: boolean) => `btn-chunky btn-small ${active ? "btn-grass" : "btn-paper"}`;
  const who = (r: InboxRow) => (r.parents.length ? r.parents.join(", ") : "No parent linked");
  const name = (r: InboxRow) => `${r.child.firstName} ${r.child.lastName}`;
  const family = (c: ChatRow) => familyName(c.parents, c.children[0]);

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={
          user.staff.role === "admin"
            ? "One chat with each family. As an admin you can read every one. Posts to many families are Announcements."
            : "One chat with each family whose children you coach. Posts to many families are Announcements."
        }
        actions={
          <>
            {/* One message to several families at once (a news post to chosen children, replies on): Coach Jav's request. */}
            <Link href="/admin/news?to=children#post-message" className="btn-chunky btn-small btn-paper">
              <Users aria-hidden size={16} />
              Post to chosen families
            </Link>
            <Link href="/admin/messages/new" className="btn-chunky btn-small btn-paper">
              <PenLine aria-hidden size={16} />
              New chat
            </Link>
          </>
        }
      >
        <nav aria-label="Show" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden [&>a]:shrink-0 [&>a]:whitespace-nowrap">
          <Link href="/admin/messages" aria-current={chatsTab && !unread ? "page" : undefined} className={tab(chatsTab && !unread)}>
            Chats
          </Link>
          <Link href="/admin/messages?show=unread" aria-current={unread ? "page" : undefined} className={tab(unread)}>
            {waiting ? `Unread (${waiting})` : "Unread"}
          </Link>
          <Link href="/admin/messages?show=absences" aria-current={absences ? "page" : undefined} className={tab(absences)}>
            {newAbsences ? `Not coming (${newAbsences} new)` : "Not coming"}
          </Link>
          <Link href="/admin/messages?show=replies" aria-current={replies || Boolean(about) ? "page" : undefined} className={tab(replies || Boolean(about))}>
            Replies to posts
          </Link>
        </nav>
        {unread && chats.length > 1 ? (
          // Reading isn't replying: these families are waiting for an answer, so it asks first.
          <details open={confirming} className="rounded-app border border-line bg-paper px-3.5 py-1">
            <summary className="min-h-12 cursor-pointer content-center text-[15px] font-bold text-grass-text underline">Mark all {chats.length} as read</summary>
            <form action={markAllRead} className="flex flex-col gap-2 pb-3">
              <input type="hidden" name="scope" value="reply" />
              <label className="flex min-h-12 items-center gap-3 text-[15px]">
                <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
                Yes, mark these {chats.length} chats as read. Nobody has replied to them yet.
              </label>
              <button type="submit" className="btn-chunky btn-paper btn-small self-start">
                Mark as read
              </button>
            </form>
          </details>
        ) : null}
        {healthNew ? (
          <Notice tone="action">
            {healthNew === 1 ? "1 new reason mentions" : `${healthNew} new reasons mention`} an injury or illness. {healthNew === 1 ? "It's" : "They're"} listed first: open {healthNew === 1 ? "it" : "each one"} to read it.
          </Notice>
        ) : null}
        {absences && newAbsences - healthNew > 0 ? (
          <form action={markAllRead}>
            <input type="hidden" name="scope" value="absences" />
            <button type="submit" className="inline-flex min-h-12 items-center text-[15px] font-bold text-grass-text underline">
              Mark the {newAbsences - healthNew} other new {newAbsences - healthNew === 1 ? "reason" : "reasons"} as read
            </button>
          </form>
        ) : null}
        {about ? <Notice>Replies to “{newsTitle ?? "a message that has been deleted"}”.</Notice> : null}
        {absences ? (
          <p className="text-[15px] text-ink-muted">
            Reasons parents gave for a child not coming. They also show on the register for that session, and once a coach has opened that register the parent sees &ldquo;Seen by&rdquo; with their name.
          </p>
        ) : null}
        {replies ? <p className="text-[15px] text-ink-muted">Parents&apos; replies to your posts, gathered by post. Open one to see each family&apos;s reply.</p> : null}
      </PageHeader>

      {groups.length ? (
        <ul aria-label="Replies to posts" className="flex flex-col gap-2.5">
          {groups.map((g) => (
            <li key={g.newsId}>
              <Link
                href={`/admin/messages?about=${g.newsId}`}
                className={`flex items-center gap-3 rounded-app border-2 bg-paper px-3.5 py-3 ${g.unread ? "border-kit-orange" : "border-line"}`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {g.unread ? <Pill tone="action">{g.unread} new</Pill> : null}
                    <span className="text-[15px] font-bold">Replies to &ldquo;{g.title}&rdquo;</span>
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {g.replies === 1 ? "1 family replied" : `${g.replies} families replied`} · {postedLabel(g.lastAt, now)}
                  </span>
                </span>
                <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {chatsTab && chats.length === 0 ? (
        <p className="rounded-app border border-line bg-paper p-4 text-[15px] text-ink-muted">
          {unread ? "Nothing unread. " : "No chats yet. Start one with New chat."}
          {unread ? (
            <Link href="/admin/messages" className="font-bold text-grass-text underline">
              See all chats
            </Link>
          ) : null}
        </p>
      ) : null}
      {!chatsTab && rows.length === 0 && groups.length === 0 ? (
        <p className="rounded-app border border-line bg-paper p-4 text-[15px] text-ink-muted">{replies ? "No replies to posts yet." : absences ? "No reasons yet." : "No replies yet."}</p>
      ) : null}

      {/* Chats: one row per family, as a messaging app lists them. */}
      {chats.length ? (
        <ul aria-label="Chats" className="flex flex-col divide-y divide-line overflow-hidden rounded-app border border-line bg-paper lg:max-w-3xl">
          {chats.map((c) => (
            <li key={c.key}>
              <Link href={`/admin/messages/family/${c.key}`} className="flex items-center gap-3 px-3.5 py-3" aria-label={`${family(c)}${c.unread ? `, ${c.unread} unread` : ""}`}>
                <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-fill text-[15px] font-bold text-ink">
                  {familyInitials(c.parents, c.children[0])}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[16px] font-bold`}>{family(c)}</span>
                    <span className={`shrink-0 text-[13px] ${c.unread ? "font-bold text-kit-orange" : "text-ink-muted"}`}>{postedLabel(c.lastAt, now)}</span>
                  </span>
                  <span className="truncate text-[13px] text-ink-muted">{c.children.map((k) => `${k.firstName} (${k.ageGroup})`).join(", ")}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[15px] ${c.unread ? "font-bold text-ink" : "text-ink-muted"}`}>
                      {c.last ? `${c.last.authorKind === "staff" ? `${c.last.authorName}: ` : ""}${c.last.preview}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {c.forAdmins ? <Pill tone="gold">For admins</Pill> : null}
                      {c.unread ? (
                        <span aria-hidden className="grid h-6 min-w-6 place-items-center rounded-full bg-kit-orange px-1.5 text-[13px] font-bold text-on-orange">
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Not coming reasons, and the replies to one post: each opens its family's chat at that message. */}
      {rows.length ? (
        <ul aria-label={absences ? "Reasons" : "Replies"} className="flex flex-col gap-2.5 lg:max-w-3xl">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/messages/${r.id}`}
                className={`flex items-center gap-3 rounded-app border-2 bg-paper px-3.5 py-3 ${r.unread ? "border-kit-orange" : "border-line"}`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {r.unread ? <Pill tone="action">Unread</Pill> : null}
                    {r.health ? <Pill tone={r.unread ? "action" : "neutral"}>Injury or illness</Pill> : null}
                    <span className="text-[15px] font-bold">{name(r)}</span>
                    <Pill tone="neutral">{r.child.ageGroup}</Pill>
                  </span>
                  <span className="text-[15px] font-bold">{r.title}</span>
                  <span className="text-[13px] text-ink-muted">
                    {who(r)} · {postedLabel(r.lastAt, now)}
                  </span>
                  {r.last ? (
                    <span className="truncate text-[14px] text-ink-muted">
                      {r.last.authorKind === "staff" ? `${r.last.authorName}: ` : ""}
                      {r.last.preview}
                    </span>
                  ) : null}
                </span>
                <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
