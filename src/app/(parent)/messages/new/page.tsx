import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { MessageForm } from "@/components/messages/MessageForm";
import { Card } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { sendParentMessage } from "@/lib/messages/actions";
import { findReplyThread, loadReplyTarget, type ReplyTarget } from "@/lib/messages/data";
import { SUBJECT_MAX } from "@/lib/messages/limits";
import { getFamily } from "@/lib/parent/load";

export const metadata: Metadata = { title: "New message" };

/**
 * A new message to the club. `?about=<news>`: a reply to club news, to whoever posted it, about one child it reaches
 * (a family with several such children picks one first; a thread that already exists for that child just opens).
 * Otherwise "Message the coaches": about one child (picked here if there are several), with an optional subject.
 */
export default async function NewMessagePage({ searchParams }: PageProps<"/messages/new">) {
  const { user, family } = await getFamily();
  const params = await searchParams;
  const about = typeof params.about === "string" && UUID.test(params.about) ? params.about : null;
  const ids = family.children.map((c) => c.id);
  const asked = family.children.find((c) => c.id === params.child) ?? null;

  if (about) {
    const targets = await asUser(user.id, async (tx) => {
      const found: { child: (typeof family.children)[number]; target: ReplyTarget }[] = [];
      for (const child of family.children) {
        const target = await loadReplyTarget(tx, about, child.id, ids);
        if (target) found.push({ child, target });
      }
      return found;
    });
    if (targets.length === 0) {
      return (
        <>
          <BackHeader back="/news" backLabel="Club news" title="Reply" />
          <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
            <Card className="p-4 text-[15px] leading-[22px]">
              Replies are closed for this message.{" "}
              <Link href="/messages/new" className="font-bold text-grass-text underline">
                Message the coaches
              </Link>{" "}
              instead.
            </Card>
          </main>
        </>
      );
    }
    const chosen = targets.length === 1 ? targets[0] : targets.find((t) => t.child.id === asked?.id);
    if (!chosen) {
      return (
        <>
          <BackHeader back="/news" backLabel="Club news" title="Reply">
            Which child is it about?
          </BackHeader>
          <main className="flex flex-col gap-2.5 px-4 pt-[18px] pb-4">
            {targets.map(({ child }) => (
              <Link
                key={child.id}
                href={`/messages/new?about=${about}&child=${child.id}`}
                className="flex min-h-12 items-center justify-between gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-3 text-[15px] font-bold"
              >
                About {child.firstName}
                <ChevronRight aria-hidden size={20} className="text-ink-muted" />
              </Link>
            ))}
          </main>
        </>
      );
    }
    const existing = await asUser(user.id, (tx) => findReplyThread(tx, about, chosen.child.id));
    if (existing) redirect(`/messages/${existing}`);
    const to = chosen.target.postedBy ?? "the club";
    return (
      <>
        <BackHeader back="/news" backLabel="Club news" title={`Reply to ${to}`}>
          About {chosen.child.firstName}: “{chosen.target.title}”. Your reply goes to {to}; {chosen.child.firstName}&apos;s coaches and the club&apos;s admins can read it too. Other parents never see it.
        </BackHeader>
        <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
          <Card className="p-4">
            <MessageForm action={sendParentMessage} hidden={{ about, child: chosen.child.id }} submitLabel={`Send to ${to}`} />
          </Card>
        </main>
      </>
    );
  }

  if (family.children.length === 0) redirect("/messages");
  const only = family.children.length === 1 ? family.children[0] : null;
  return (
    <>
      <BackHeader back="/messages" backLabel="Messages" title="Message the coaches">
        Your child&apos;s coaches and the club&apos;s admins see it. Other parents never do.
      </BackHeader>
      <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
        <Card className="p-4">
          <MessageForm action={sendParentMessage} hidden={only ? { child: only.id } : {}} submitLabel="Send to the coaches">
            {only ? (
              <p className="text-[15px]">About {only.firstName}</p>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="field-label">Which child is it about?</legend>
                {family.children.map((c) => (
                  <label key={c.id} className="flex min-h-12 items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
                    <input type="radio" name="child" value={c.id} defaultChecked={c.id === asked?.id} className="h-5 w-5 accent-[var(--grass)]" />
                    <span className="text-[15px] font-bold">{c.firstName}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <div>
              <label htmlFor="message-subject" className="field-label">
                Subject (optional)
              </label>
              <input id="message-subject" name="subject" maxLength={SUBJECT_MAX} className="field" placeholder="Running late on Friday" />
            </div>
          </MessageForm>
        </Card>
      </main>
    </>
  );
}
