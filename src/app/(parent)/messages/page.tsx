import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, PenLine } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { postedLabel } from "@/lib/dates";
import { getMessagesPage } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Messages" };

/** Messages: the family's conversations with the club, newest first, with a dot on those with something new. */
export default async function MessagesPage() {
  const { family, conversations } = await getMessagesPage();
  const now = new Date();
  const several = family.children.length > 1;

  return (
    <>
      <BackHeader back="/news" backLabel="Club news" title="Messages">
        Between you and the club. Both of a child&apos;s parents see the same messages, and the club&apos;s admins can read every conversation.
      </BackHeader>
      <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
        {family.children.length ? (
          <Link href="/messages/new" className="btn-chunky btn-grass w-full">
            <PenLine aria-hidden size={20} />
            Message the coaches
          </Link>
        ) : (
          <Card className="p-4 text-[15px] leading-[22px]">No players are linked to your email yet. Ask the club to add your child.</Card>
        )}
        {conversations.length === 0 && family.children.length ? (
          <Card className="p-4 text-[15px] leading-[22px] text-ink-muted">No messages yet. Replies to club news and your messages to the coaches will be here.</Card>
        ) : null}
        {conversations.length ? (
          <ul aria-label="Conversations" className="flex flex-col gap-2.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  className={`flex items-center gap-3 rounded-app border-2 bg-paper px-3.5 py-3 ${c.unread ? "border-kit-orange" : "border-line"}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      {c.unread ? (
                        <span className="shrink-0 rounded-pill bg-kit-orange px-2 py-0.5 text-[11px] font-bold text-on-orange uppercase">New</span>
                      ) : null}
                      <span className="truncate text-[15px] font-bold">{c.title}</span>
                    </span>
                    <span className="text-[13px] text-ink-muted">
                      {several ? `${c.childFirstName} · ` : ""}
                      {c.withName ? `With ${c.withName}` : "With the coaches"} · {postedLabel(c.lastAt, now)}
                    </span>
                    {c.last ? (
                      <span className="truncate text-[14px] text-ink-muted">
                        {c.last.mine ? "You" : c.last.authorName}: {c.last.preview}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </>
  );
}
