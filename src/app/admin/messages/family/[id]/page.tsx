import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/bits";
import { Chat } from "@/components/messages/Chat";
import { ChatComposer } from "@/components/messages/ChatComposer";
import { ChatLive } from "@/components/messages/ChatLive";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { sendStaffChatMessage } from "@/lib/messages/actions";
import { loadFamilyChat, markChatRead } from "@/lib/messages/data";
import { familyName } from "@/lib/messages/family-name";

export const metadata: Metadata = { title: "Chat" };

/** Replies staff type again and again (the review found one typed by hand dozens of times). A tap puts it in the box. */
const QUICK_REPLIES = ["Thanks for letting us know.", "Thanks, hope they feel better soon.", "No problem, see you next session."] as const;

/**
 * One family's chat with the club (`id`: any child of the family): every message, reply to a post and "not coming"
 * reason in order, with the box to answer at the foot. Opening it reads it. A 404 unless this member of staff
 * covers one of the family's children.
 */
export default async function FamilyChatPage({ params }: PageProps<"/admin/messages/family/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const chat = await asUser(user.id, async (tx) => {
    const found = await loadFamilyChat(tx, { staff: id });
    if (found) await markChatRead(tx, { staff: id });
    return found;
  });
  if (!chat) notFound();
  const now = new Date();

  return (
    <div className="flex flex-col gap-3 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin/messages", label: "Inbox" }} title={familyName(chat.parents.map((p) => p.name), chat.children[0])}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
          {chat.children.map((c) => (
            <Link key={c.id} href={`/admin/families/${c.id}`} className="inline-flex min-h-12 items-center gap-1.5 font-bold text-grass-text underline underline-offset-4">
              {c.firstName} {c.lastName}
              <Pill tone="neutral">{c.ageGroup}</Pill>
            </Link>
          ))}
        </p>
        <p className="text-[13px] text-ink-muted">
          {chat.parents.length ? "Every parent of these children sees this chat" : "No parent is linked yet, so nobody will see a message"}, as do their coaches and the club&apos;s admins. Messages
          can&apos;t be edited or deleted.
        </p>
      </PageHeader>
      {chat.messages.length ? (
        <Chat chat={chat} now={now} side="staff" />
      ) : (
        <p className="rounded-app border border-line bg-paper p-4 text-[15px] text-ink-muted">No messages with this family yet. Write the first one below.</p>
      )}
      <ChatLive count={chat.messages.length} lastId={chat.messages.at(-1)?.id ?? null} />
      <ChatComposer
        action={sendStaffChatMessage}
        hidden={{ family: chat.key }}
        about={chat.children.map((c) => ({ id: c.id, firstName: c.firstName }))}
        aboutNow={chat.about ?? chat.key}
        media
        quickReplies={QUICK_REPLIES}
        stick="bottom-[var(--staff-bar-height,0px)] lg:bottom-0"
        placeholder="Message the family"
      />
    </div>
  );
}
