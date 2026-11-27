import type { Metadata } from "next";
import { staffNameForParents } from "@/lib/greeting";
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
          <BackHeader back="/news" backLabel="Home" title="Reply" />
          <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
            <Card className="p-4 text-small leading-[22px]">
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
          <BackHeader back="/news" backLabel="Home" title="Reply">
            Which child is it about?
          </BackHeader>
          <main className="flex flex-col gap-2.5 px-4 pt-[18px] pb-4">
            {targets.map(({ child }) => (
              <Link
                key={child.id}
                href={`/messages/new?about=${about}&child=${child.id}`}
                className="flex min-h-12 items-center justify-between gap-3 rounded-app bg-paper shadow-card px-3.5 py-3 text-small font-bold"
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
    const to = staffNameForParents(chosen.target.postedBy) ?? "the club";
    return (
      <>
        <BackHeader back="/news" backLabel="Home" title={`Reply to ${to}`}>
          About {chosen.child.firstName}: “{chosen.target.title}”. Your reply goes to {to}. Who can read it: {chosen.child.firstName}&apos;s parents and carers on the app (so your partner too), {chosen.child.firstName}&apos;s coaches and the club&apos;s admins. Other families never see it.
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
      <BackHeader back="/messages" backLabel="Messages" title="Message the club">
        Who can read it: your child&apos;s parents and carers on the app (so your partner too), their coaches and the club&apos;s admins. Other families never see it.
      </BackHeader>
      <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
        <Card className="p-4">
          <MessageForm action={sendParentMessage} hidden={only ? { child: only.id } : {}} submitLabel="Send">
            {only ? (
              <p className="text-small">About {only.firstName}</p>
            ) : (
              // Tick boxes, so one message can be about both children (it goes into each child's own conversation).
              <fieldset className="flex flex-col gap-2">
                <legend className="field-label">Which child is it about? Tick more than one if it&apos;s about both.</legend>
                {family.children.map((c) => (
                  <label key={c.id} className="flex min-h-12 items-center gap-3 rounded-app bg-paper shadow-card px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
                    <input type="checkbox" name="child" value={c.id} defaultChecked={c.id === asked?.id} className="check" />
                    <span className="text-small font-bold">{c.firstName}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {/* Who it's for decides who is told: payments, the shop and account questions are the admins' (messaging review, Nov 2026). */}
            <fieldset className="flex flex-col gap-2">
              <legend className="field-label">Who is it for?</legend>
              <label className="flex min-h-12 items-center gap-3 rounded-app bg-paper shadow-card px-3.5 py-2 has-[:checked]:bg-grass-tint">
                <input type="radio" name="to" value="coaches" defaultChecked className="check" />
                <span className="text-small">
                  <b>The coaches</b>
                  <span className="block text-meta text-ink-muted">Training, matches, injuries, how your child is getting on</span>
                </span>
              </label>
              <label className="flex min-h-12 items-center gap-3 rounded-app bg-paper shadow-card px-3.5 py-2 has-[:checked]:bg-grass-tint">
                <input type="radio" name="to" value="admins" className="check" />
                <span className="text-small">
                  <b>The club&apos;s admins</b>
                  <span className="block text-meta text-ink-muted">Payments, the shop, your account</span>
                </span>
              </label>
            </fieldset>
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
