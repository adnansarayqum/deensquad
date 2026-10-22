import type { Metadata } from "next";
import { staffNameForParents } from "@/lib/greeting";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { MessageForm } from "@/components/messages/MessageForm";
import { QuotedNews, Thread } from "@/components/messages/Thread";
import { Card } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { sendParentMessage } from "@/lib/messages/actions";
import { loadThread, markRead } from "@/lib/messages/data";
import { getFamily } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Message" };

/** One conversation with the club: the messages, oldest first, and a reply box. Opening it marks it read. */
export default async function ConversationPage({ params, searchParams }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { sent } = await searchParams;
  const { user, family } = await getFamily();
  const thread = await asUser(user.id, async (tx) => {
    const found = await loadThread(tx, id, { parent: family.children.map((c) => c.id) });
    if (found) await markRead(tx, id);
    return found;
  });
  if (!thread) notFound();
  const withName = staffNameForParents(thread.withName) ?? "the coaches";

  return (
    <>
      <BackHeader back="/messages" backLabel="Messages" title={thread.title}>
        About {thread.child.firstName} · with {withName}
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-[18px] pb-4">
        {sent ? (
          <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
            Sent. You&apos;ll get a notification when the club replies.
          </p>
        ) : null}
        {thread.news ? <QuotedNews news={{ ...thread.news, postedBy: staffNameForParents(thread.news.postedBy) }} now={new Date()} /> : null}
        <Thread messages={thread.messages.map((m) => (m.authorKind === "staff" ? { ...m, authorName: staffNameForParents(m.authorName) ?? m.authorName } : m))} now={new Date()} />
        <Card className="p-4">
          <MessageForm action={sendParentMessage} hidden={{ conversation: thread.id }} label="Reply" submitLabel="Send reply" compact />
        </Card>
        <p className="text-[13px] leading-5 text-ink-muted">
          {thread.child.firstName}&apos;s parents, {thread.child.firstName}&apos;s coaches and the club&apos;s admins can read this conversation. Messages are kept as club records.
        </p>
      </main>
    </>
  );
}
