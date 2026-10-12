import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader, Section } from "@/components/admin/bits";
import { MessageForm } from "@/components/messages/MessageForm";
import { Thread } from "@/components/messages/Thread";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { sendStaffMessage } from "@/lib/messages/actions";
import { loadThread, markRead } from "@/lib/messages/data";

export const metadata: Metadata = { title: "Message" };

/** One conversation with a family: who it's about and with, the messages, and a reply box. Opening it marks it read. */
export default async function AdminConversationPage({ params, searchParams }: PageProps<"/admin/messages/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { sent } = await searchParams;
  const thread = await asUser(user.id, async (tx) => {
    const found = await loadThread(tx, id, "staff");
    if (found) await markRead(tx, id);
    return found;
  });
  if (!thread) notFound();
  const familyHref = `/admin/families/${thread.child.id}`;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: "/admin/messages?show=all", label: "Messages" }}
        title={thread.title}
        subtitle={thread.withName ? `Sent to ${thread.withName}` : "Sent to the coaches"}
      >
        <div className="flex flex-col gap-1.5 rounded-app border-2 border-line bg-paper px-4 py-3">
          <p className="flex flex-wrap items-center gap-2 text-[15px]">
            <Link href={familyHref} className="inline-flex min-h-12 items-center font-bold text-grass-text underline underline-offset-4">
              {thread.child.firstName} {thread.child.lastName}
            </Link>
            <Pill tone="neutral">{thread.child.ageGroup}</Pill>
          </p>
          <p className="text-[14px] text-ink-muted">
            Parents:{" "}
            {thread.parents.length
              ? thread.parents.map((p, i) => (
                  <span key={p.id}>
                    {i ? ", " : ""}
                    <Link href={familyHref} className="font-bold text-grass-text underline underline-offset-4">
                      {p.name}
                    </Link>
                  </span>
                ))
              : "none linked"}
          </p>
          {thread.newsId ? (
            <Link href={`/admin/news/${thread.newsId}`} className="inline-flex min-h-12 items-center self-start text-[14px] font-bold text-grass-text underline underline-offset-4">
              Open the club message it replies to
            </Link>
          ) : null}
        </div>
      </PageHeader>
      {sent ? <Notice>Sent. {thread.child.firstName}&apos;s parents are notified in the app, or by email if they haven&apos;t turned notifications on.</Notice> : null}

      <Thread messages={thread.messages} now={new Date()} />

      <Section title="Reply">
        <MessageForm action={sendStaffMessage} hidden={{ conversation: thread.id }} label={`Reply to ${thread.child.firstName}'s parents`} submitLabel="Send reply" />
        <p className="text-[13px] text-ink-muted">Both of {thread.child.firstName}&apos;s parents see it. The club&apos;s admins can read every conversation. Messages can&apos;t be edited or deleted.</p>
      </Section>
    </div>
  );
}
