import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Heart, MessageCircle, Phone } from "lucide-react";
import { Notice, PageHeader, ReadBar, Section } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { chaseOnWhatsApp, deleteNews } from "@/lib/admin/actions";
import { audienceLabel, loadNewsDetail } from "@/lib/admin/data";
import { MediaGallery } from "@/components/media/MediaGallery";
import { loadMediaFor } from "@/lib/media/data";
import { within } from "@/lib/admin/scope";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { postedLabel, shortDay, clock } from "@/lib/dates";
import { LADDER } from "@/lib/chase/ladder";
import { pushConfigured, smsConfigured } from "@/lib/chase/senders";
import { canSendEmail } from "@/lib/email/send";
import { dialable } from "@/lib/validate";
import { countReplies, loadNewsAnswers } from "@/lib/messages/data";
import { tallyAnswers } from "@/lib/messages/quick-answers";

export const metadata: Metadata = { title: "Message" };

export default async function NewsDetailPage({ params, searchParams }: PageProps<"/admin/news/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  const flags = await searchParams;
  if (!UUID.test(id)) notFound();
  const mine = coachLimit(user.staff);
  const detail = await asUser(user.id, async (tx) => {
    const found = await loadNewsDetail(tx, id, mine);
    return found ? { ...found, answers: await loadNewsAnswers(tx, id, mine), replies: await countReplies(tx, id), likedBy: await tx.query<{ first_name: string; last_name: string }>(
      `select g.first_name, g.last_name from announcement_likes l join guardians g on g.id = l.guardian_id where l.announcement_id = $1 order by l.created_at`,
      [id],
    ), media: (await loadMediaFor(tx, "announcement", [id])).get(id) ?? [] } : null;
  });
  if (!detail) notFound();
  const { news, unread, answers, replies, media, likedBy } = detail;
  const tally = answers?.options ? tallyAnswers(answers.options, answers.children) : null;
  // A group coach can delete only messages that went to their own groups alone.
  const canDelete = !mine || within(news.audience, mine);
  const chase = unread.filter((u) => !u.partnerRead);
  const covered = unread.filter((u) => u.partnerRead);
  const posted = new Date(news.postedAt).getTime();
  const at = (hours: number) => new Date(posted + hours * 3600_000).toISOString();
  const steps = [
    { label: "App notification", when: "when posted", ready: pushConfigured() },
    {
      label: "Email reminder",
      // Session notices (cancelled, restored, changed) email at once; quiet hours still hold them until 8am.
      when: news.urgent ? "when posted" : `${shortDay(at(LADDER.email.afterHours))} ${clock(at(LADDER.email.afterHours))}`,
      ready: canSendEmail(),
    },
    { label: "Text reminder", when: `${shortDay(at(LADDER.sms.afterHours))} ${clock(at(LADDER.sms.afterHours))}`, ready: smsConfigured() },
  ];
  const chaseLabel: Record<string, string> = { app: "Notified", email: "Emailed", sms: "Texted", whatsapp: "WhatsApp", gate: "At the gate" };

  return (
    // Forms and detail read best at phone-to-tablet width, even on a computer.
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin/news", label: "Announcements" }} title={news.title} subtitle={`${news.topic} · ${audienceLabel(news)} · ${postedLabel(news.postedAt, new Date())}${news.postedBy ? ` · ${news.postedBy}` : ""}`} />
      {flags.posted ? (
        <Notice>
          Posted. Sent to {news.audienceCount} {news.audienceCount === 1 ? "parent" : "parents"}: they see it on the Home screen.
        </Notice>
      ) : null}

      <Section title="Message">
        {news.chosen && news.chosen.length > 2 ? <p className="text-sm text-ink-muted">For {news.chosen.join(", ")}</p> : null}
        <p className="text-[15px] leading-[22px] whitespace-pre-line">{news.body}</p>
        <MediaGallery items={media} label={news.title} />
        {likedBy.length ? (
          <p className="flex items-start gap-1.5 text-sm">
            <Heart aria-hidden size={16} className="mt-0.5 shrink-0 fill-current text-grass-text" />
            <span>
              <span className="font-bold">{likedBy.length === 1 ? "1 like" : `${likedBy.length} likes`}</span>
              <span className="text-ink-muted">: {likedBy.map((g) => `${g.first_name} ${g.last_name[0] ?? ""}.`).join(", ")}</span>
            </span>
          </p>
        ) : null}
        {news.requiresAck ? <ReadBar read={news.readCount} total={news.audienceCount} groupsOnly={news.groupsOnly} /> : <p className="text-sm text-ink-muted">No read receipts asked for.</p>}
        {/* The three numbers that make up the total, side by side (admin UX review, Oct 2026: 50 read, 39 to remind and 8
            whose partner read it looked like a mismatch when the 8 were only at the foot of the list). */}
        {news.requiresAck && unread.length ? (
          <p className="text-sm text-ink-muted">
            {news.readCount} read · {chase.length} still to read{covered.length ? ` · ${covered.length} whose child's other parent has read it` : ""}
          </p>
        ) : null}
      </Section>

      {tally ? (
        <Section title="Quick answers" aside={<span className="text-sm text-ink-muted">{answers!.children.length - tally.none.length} of {answers!.children.length} answered</span>}>
          <p className="text-sm text-ink-muted">One answer per child; either parent can give or change it. Answering counts as reading it.</p>
          <ul className="flex flex-col gap-2 text-[15px]">
            {tally.tally.map((t) => (
              <li key={t.answer} className="border-t border-line pt-2 first:border-0 first:pt-0">
                <b>
                  {t.answer} ({t.children.length})
                </b>
                {t.children.length ? `: ${t.children.join(", ")}` : null}
              </li>
            ))}
            <li className="border-t border-line pt-2">
              <b>No answer yet ({tally.none.length})</b>
              {tally.none.length ? <span className="text-ink-muted">: {tally.none.join(", ")}</span> : null}
            </li>
          </ul>
        </Section>
      ) : null}

      {answers?.allowReplies || replies > 0 ? (
        <Section title="Replies">
          <p className="text-[15px]">
            {replies === 0
              ? "No replies yet. Each parent's reply starts a private conversation in Messages."
              : `${replies} ${replies === 1 ? "conversation" : "conversations"} with families about this message.`}
          </p>
          {replies > 0 ? (
            <Link href={`/admin/messages?about=${news.id}`} className="inline-flex min-h-12 items-center self-start text-[15px] font-bold text-grass-text underline underline-offset-4">
              See the replies
            </Link>
          ) : null}
        </Section>
      ) : null}

      {news.requiresAck ? (
        <Section title="Automatic reminders">
          <p className="text-sm text-ink-muted">
            Only parents who haven&apos;t read it (and whose child&apos;s other parent hasn&apos;t either) are reminded. Nothing is sent between 9pm and 8am.
            Children of parents who still haven&apos;t read it after two days are flagged on the coach&apos;s register.
          </p>
          <ol className="flex flex-col gap-1.5 text-[15px]">
            {steps.map((s) => (
              <li key={s.label} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b>{s.label}</b> · {s.when}
                </span>
                {s.ready ? <Pill tone="done">On</Pill> : <Pill tone="neutral">Not set up yet</Pill>}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {news.requiresAck ? (
        <Section title={chase.length ? `Not read yet (${chase.length})` : news.audienceCount === 0 ? "No parents to read it yet" : "Everyone has read it"}>
          {chase.length ? <p className="text-sm text-ink-muted">WhatsApp opens with a short reminder ready to send. Each reminder is logged.</p> : null}
          <ul className="flex flex-col gap-2">
            {chase.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 first:border-0 first:pt-0">
                <span className="flex flex-col">
                  <span className="text-[15px] font-bold">{u.name}</span>
                  <span className="text-[13px] text-ink-muted">
                    {u.children} · {u.inApp ? "in the app" : "hasn't signed in yet"}
                  </span>
                  {u.chased.length ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {[...new Set(u.chased)].map((c) => (
                        <Pill key={c} tone="neutral">
                          {chaseLabel[c] ?? c}
                          {c === "whatsapp" && u.chased.filter((x) => x === c).length > 1 ? ` ×${u.chased.filter((x) => x === c).length}` : ""}
                        </Pill>
                      ))}
                    </span>
                  ) : null}
                </span>
                {u.phone ? (
                  <span className="flex gap-2">
                    <form action={chaseOnWhatsApp}>
                      <input type="hidden" name="news" value={news.id} />
                      <input type="hidden" name="guardian" value={u.id} />
                      <button type="submit" className="btn-chunky btn-paper btn-small" aria-label={`WhatsApp ${u.name}`}>
                        <MessageCircle aria-hidden size={16} />
                        WhatsApp
                      </button>
                    </form>
                    <a href={`tel:+${dialable(u.phone)}`} className="btn-chunky btn-paper btn-small" aria-label={`Call ${u.name}`}>
                      <Phone aria-hidden size={16} />
                    </a>
                  </span>
                ) : (
                  <Pill tone="neutral">No phone</Pill>
                )}
              </li>
            ))}
          </ul>
          {covered.length ? (
            <p className="text-sm text-ink-muted">
              The other parent has read it for: {covered.map((u) => `${u.name} (${u.children})`).join(", ")}.
            </p>
          ) : null}
        </Section>
      ) : null}

      {canDelete ? (
        <details className="rounded-app border border-line bg-paper px-4 py-3">
          <summary className="cursor-pointer text-[15px] font-bold">Delete this message</summary>
          <form action={deleteNews} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="id" value={news.id} />
            <label className="flex min-h-11 items-center gap-3 text-[15px] font-bold">
              <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 accent-[var(--kit-orange)]" />
              Yes, delete it for every parent
            </label>
            <button type="submit" className="btn-chunky btn-paper self-start">
              Delete
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
