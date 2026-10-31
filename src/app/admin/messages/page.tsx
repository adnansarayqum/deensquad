import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, PenLine } from "lucide-react";
import { Notice, PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { postedLabel } from "@/lib/dates";
import { markAllRead } from "@/lib/messages/actions";
import { loadStaffUnread, loadInbox, type InboxRow } from "@/lib/messages/data";

export const metadata: Metadata = { title: "Messages" };

/**
 * The staff inbox: conversations with families about children this person covers (their groups; every group for
 * admins) or addressed to them, newest first. "Unread" (the default) has a parent's message they haven't opened.
 * `?about=<news>` lists the replies to one club message.
 */
export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const user = await requireStaff();
  const params = await searchParams;
  const about = typeof params.about === "string" && UUID.test(params.about) ? params.about : null;
  const absences = params.show === "absences" && !about;
  const all = params.show === "all" || absences || Boolean(about);
  const [rows, newsTitle, newAbsences] = await asUser(user.id, async (tx) => {
    const list = await loadInbox(tx, { unreadOnly: !all, about, absences });
    const [news] = about ? await tx.query<{ title: string }>(`select title from announcements where id = $1`, [about]) : [];
    return [list, news?.title ?? null, await loadStaffUnread(tx, { absences: true })] as const;
  });
  const confirming = params.markall === "confirm";
  const now = new Date();
  const tab = (active: boolean) => `btn-chunky btn-small ${active ? "btn-grass" : "btn-paper"}`;
  const who = (r: InboxRow) => (r.parents.length ? r.parents.join(", ") : "No parent linked");
  const name = (r: InboxRow) => `${r.child.firstName} ${r.child.lastName}`;

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={
          user.staff.role === "admin"
            ? "Conversations with families. As an admin you can read every one."
            : "Conversations with families in your groups, and any sent to you."
        }
      >
        <nav aria-label="Show" className="flex flex-wrap gap-2">
          <Link href="/admin/messages" aria-current={!all ? "page" : undefined} className={tab(!all)}>
            Needs reply
          </Link>
          <Link href="/admin/messages?show=all" aria-current={all && !about && !absences ? "page" : undefined} className={tab(all && !about && !absences)}>
            All
          </Link>
          <Link href="/admin/messages?show=absences" aria-current={absences ? "page" : undefined} className={tab(absences)}>
            {newAbsences ? `Not coming (${newAbsences} new)` : "Not coming"}
          </Link>
          <Link href="/admin/messages/new" className="btn-chunky btn-small btn-paper ml-auto">
            <PenLine aria-hidden size={16} />
            New message
          </Link>
        </nav>
        {!all && rows.length > 1 ? (
          // Reading isn't replying: these families are waiting for an answer, so it asks first.
          <details open={confirming} className="rounded-app border-2 border-line bg-paper px-3.5 py-1">
            <summary className="min-h-12 cursor-pointer content-center text-[15px] font-bold text-grass-text underline">Mark all {rows.length} as read</summary>
            <form action={markAllRead} className="flex flex-col gap-2 pb-3">
              <input type="hidden" name="scope" value="reply" />
              <label className="flex min-h-12 items-center gap-3 text-[15px]">
                <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
                Yes, mark these {rows.length} conversations as read. Nobody has replied to them yet.
              </label>
              <button type="submit" className="btn-chunky btn-paper btn-small self-start">
                Mark as read
              </button>
            </form>
          </details>
        ) : null}
        {absences && newAbsences > 0 ? (
          <form action={markAllRead}>
            <input type="hidden" name="scope" value="absences" />
            <button type="submit" className="inline-flex min-h-12 items-center text-[15px] font-bold text-grass-text underline">
              Mark the {newAbsences} new {newAbsences === 1 ? "reason" : "reasons"} as read
            </button>
          </form>
        ) : null}
        {about ? <Notice>Replies to “{newsTitle ?? "a message that has been deleted"}”.</Notice> : null}
        {absences ? <p className="text-[15px] text-ink-muted">Reasons parents gave for a child not coming. They also show on the register for that session.</p> : null}
      </PageHeader>

      {rows.length === 0 ? (
        <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px] text-ink-muted">
          {all ? "No conversations yet." : "Nothing waiting for a reply. "}
          {all ? null : (
            <Link href="/admin/messages?show=all" className="font-bold text-grass-text underline">
              See all conversations
            </Link>
          )}
        </p>
      ) : null}

      {/* Phones: one card per conversation. */}
      {rows.length ? (
        <ul aria-label="Conversations" className="flex flex-col gap-2.5 lg:hidden">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/messages/${r.id}`}
                className={`flex items-center gap-3 rounded-app border-2 bg-paper px-3.5 py-3 ${r.unread ? "border-kit-orange" : "border-line"}`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {r.unread ? <Pill tone="action">Unread</Pill> : null}
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

      {/* Computers: a table, one row per conversation. */}
      {rows.length ? (
        <div className="hidden overflow-x-auto rounded-app border-2 border-line bg-paper lg:block">
          <table className="w-full text-[14px]">
            <caption className="sr-only">Conversations</caption>
            <thead>
              <tr className="border-b-2 border-line text-left text-label text-ink-muted uppercase">
                <th scope="col" className="py-2.5 pr-2 pl-2.5 font-bold">
                  Child
                </th>
                <th scope="col" className="px-2 py-2.5 font-bold">
                  Parents
                </th>
                <th scope="col" className="px-2 py-2.5 font-bold">
                  Subject
                </th>
                <th scope="col" className="px-2 py-2.5 font-bold">
                  Last message
                </th>
                <th scope="col" className="px-2 py-2.5 font-bold">
                  Time
                </th>
                <th scope="col" className="py-2.5 pr-2.5 pl-2 font-bold">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-middle">
                  <th scope="row" className="py-2 pr-2 pl-2.5 text-left font-bold whitespace-nowrap">
                    {name(r)} <Pill tone="neutral">{r.child.ageGroup}</Pill>
                  </th>
                  <td className="px-2 py-2 text-ink-muted">{who(r)}</td>
                  <td className="px-2 py-2">
                    <Link href={`/admin/messages/${r.id}`} className="inline-flex min-h-12 items-center font-bold text-grass-text underline underline-offset-4">
                      {r.title}
                    </Link>
                  </td>
                  <td className="max-w-80 px-2 py-2 text-ink-muted">
                    <span className="line-clamp-2">{r.last ? `${r.last.authorKind === "staff" ? `${r.last.authorName}: ` : ""}${r.last.preview}` : "–"}</span>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-ink-muted">{postedLabel(r.lastAt, now)}</td>
                  <td className="py-2 pr-2.5 pl-2">{r.unread ? <Pill tone="action">Unread</Pill> : <Pill tone="neutral">Read</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
