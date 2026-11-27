import type { Metadata } from "next";
import Link from "next/link";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { Chat } from "@/components/messages/Chat";
import { ChatComposer } from "@/components/messages/ChatComposer";
import { ChatLive } from "@/components/messages/ChatLive";
import { Card } from "@/components/ui";
import { asUser } from "@/lib/db";
import { staffNameForParents } from "@/lib/greeting";
import { sendChatMessage } from "@/lib/messages/actions";
import { loadFamilyChat, markChatRead } from "@/lib/messages/data";
import { getFamily } from "@/lib/parent/load";
import { backTarget } from "@/lib/parent/tabs";

export const metadata: Metadata = { title: "Messages" };

/**
 * Messages: the family's one chat with the club, like a messaging app (26 Nov 2026). Everything between the family
 * and the club is here in order, the newest at the foot with the box to write under it: messages, replies to posts
 * and "not coming" reasons. Opening it reads it.
 */
export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const params = await searchParams;
  const back = backTarget(params.from, { href: "/player", label: "Family" });
  const { user, family } = await getFamily();
  const ids = family.children.map((c) => c.id);
  const chat = await asUser(user.id, async (tx) => {
    const found = await loadFamilyChat(tx, { parent: ids });
    await markChatRead(tx, { parent: ids });
    return found;
  });
  const now = new Date();
  const messages = chat?.messages ?? [];

  return (
    <>
      <BackHeader back={back.href} backLabel={back.label} title="Messages">
        Between your family and the club.
      </BackHeader>
      <main className="flex flex-col gap-3 px-4 pt-3">
        {family.children.length === 0 ? (
          <Card className="p-4 text-small leading-[22px]">No players are linked to your email yet. Ask the club to add your child.</Card>
        ) : (
          <>
            <p className="text-meta leading-5 text-ink-muted">
              Your children&apos;s parents and carers, their coaches and the club&apos;s admins can read this. Other families never can.{" "}
              <Link href="/messages/new" className="inline-flex min-h-12 items-center font-bold text-grass-text underline">
                Write to the club&apos;s admins instead
              </Link>
            </p>
            {chat && messages.length ? (
              <Chat chat={chat} now={now} side="parent" nameOf={(name) => staffNameForParents(name) ?? name} />
            ) : (
              <Card>
                <EmptyState>No messages yet. Write to the coaches below.</EmptyState>
              </Card>
            )}
            <ChatLive count={messages.length} lastId={messages.at(-1)?.id ?? null} />
            <ChatComposer
              action={sendChatMessage}
              about={family.children.map((c) => ({ id: c.id, firstName: c.firstName }))}
              aboutNow={chat?.about ?? null}
              stick="bottom-[var(--tab-bar-height,84px)]"
              placeholder="Message the club"
            />
          </>
        )}
      </main>
    </>
  );
}
