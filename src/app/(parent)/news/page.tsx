import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { TripCards } from "@/components/TripCards";
import { Check, ChevronRight, MessageCircle, Reply } from "lucide-react";
import { AcknowledgeButton } from "@/components/AcknowledgeButton";
import { QuickAnswers } from "@/components/messages/QuickAnswers";
import { NotificationsCard } from "@/components/NotificationsCard";
import { ReadFocus } from "@/components/ReadFocus";
import { StaffSwitch } from "@/components/StaffSwitch";
import { AppHeader, Card, Eyebrow, Pill } from "@/components/ui";
import { postedLabel } from "@/lib/dates";
import { getNewsPage } from "@/lib/parent/load";
import type { AnnouncementView, Family } from "@/lib/parent/data";
import { MediaGallery } from "@/components/media/MediaGallery";
import { ThisWeek } from "@/components/ThisWeek";
import { ComingOnNews, SessionNow, canAnswerComing } from "@/components/NewsSession";
import { groupsPlural } from "@/lib/domain";

export const metadata: Metadata = { title: "Club news" };

export default async function NewsPage() {
  const { family, news, week, stepsLeft, unreadMessages, trips, wellbeingChild } = await getNewsPage();
  const now = new Date();
  const unread = news.filter((a) => !a.read);
  const earlier = news.filter((a) => a.read);

  return (
    <>
      <AppHeader>
        <StaffSwitch />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/crest.png" alt="Deen Squad crest" width={44} height={44} className="rounded-[10px]" priority />
            <div>
              <p className="text-[13px] text-on-pitch-muted">Assalamu alaikum, {family.guardian.firstName}</p>
              <h1 className="font-display text-[34px] leading-none tracking-[0.02em]">Club news</h1>
            </div>
          </div>
        </div>
      </AppHeader>

      <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
        {/* Is training on, when, and each child's answer: the first thing on the screen every parent lands on. */}
        <ThisWeek family={family} week={week} stepsLeft={stepsLeft} now={now} />
        {unreadMessages > 0 ? (
          <Link
            href="/messages?from=/news"
            className="flex items-center gap-3 rounded-app border-2 border-kit-orange bg-orange-tint px-3.5 py-3 text-ink transition-transform active:translate-y-1"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-kit-orange text-on-orange">
              <MessageCircle aria-hidden size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">
                {unreadMessages === 1 ? "1 new message from the club" : `${unreadMessages} new messages from the club`}
              </span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0" />
          </Link>
        ) : null}
        <TripCards trips={trips.filter((t) => t.children.some((c) => !c.answer))} from="/news" />
        {wellbeingChild ? (
          <Link
            href={`/player/wellbeing?child=${wellbeingChild.id}&from=/news`}
            className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-3 text-ink"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">How&apos;s {wellbeingChild.firstName} finding football?</span>
              <span className="text-[13px] text-ink-muted">A quick private check-in with the club</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
        ) : null}
        <NotificationsCard publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
        {family.children.length === 0 ? (
          <Card className="p-4 text-[15px] leading-[22px]">
            No players are linked to your email yet. Ask the club to add your child, then open the app again.
          </Card>
        ) : unread.length > 0 ? (
          <section aria-labelledby="needs-tap" className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <Eyebrow>
                <span id="needs-tap">Needs your tap</span>
              </Eyebrow>
              <span className="rounded-pill bg-kit-orange px-2.5 py-0.5 text-xs font-bold text-on-orange">{unread.length} unread</span>
            </div>
            {unread.map((a) => (
              <Card key={a.id} tone="gold" className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Pill tone="action">
                    {a.topic}
                    {a.audience === "all" ? "" : ` · ${groupsPlural(a.audience)}`}
                  </Pill>
                  <span className="text-[13px] text-ink-muted">{postedLabel(a.postedAt, now)}</span>
                </div>
                <h2 className="text-[19px] leading-[25px] font-bold">{a.title}</h2>
                <p className="text-[16px] leading-6 whitespace-pre-line">{a.body}</p>
                <MediaGallery items={a.media} label={a.title} />
                {outOfDate(a) ? <SessionNow session={a.session!} now={now} /> : null}
                {a.postedBy ? <p className="text-[14px] text-ink-muted">From {a.postedBy}</p> : null}
                {a.quickAnswers && a.reaches.length ? (
                  <Answers a={a} family={family} />
                ) : canAnswerComing(a.session) ? (
                  // Answering Coming / Not coming here is the same answer as on Sessions, and counts as read.
                  <ComingOnNews session={a.session} family={family} now={now} />
                ) : (
                  <AcknowledgeButton announcementId={a.id} title={a.title} />
                )}
                <ReplyLink a={a} />
              </Card>
            ))}
          </section>
        ) : (
          <p className="flex items-center gap-2 px-1 text-[15px] font-bold text-grass-text">
            {news.length ? (
              <>
                <Check aria-hidden size={18} strokeWidth={3} />
                You&apos;re all caught up.
              </>
            ) : (
              "No club news yet. Messages from the club will appear here."
            )}
          </p>
        )}

        {earlier.length > 0 ? (
          <section aria-labelledby="earlier" className="mt-1 flex flex-col gap-3">
            <Eyebrow>
              <span id="earlier">Earlier</span>
            </Eyebrow>
            {earlier.map((a) => (
              <ReadFocus key={a.id} id={a.id} className="flex flex-col gap-2 rounded-app border-2 border-line bg-paper px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] text-ink-muted">
                    {a.topic} · {a.audience === "all" ? "All groups" : a.audience.join(", ")} · {postedLabel(a.postedAt, now)}
                  </span>
                  {outOfDate(a) ? (
                    // A newer cancelled / back on / changed notice about the same session: this one no longer applies.
                    <span className="shrink-0 whitespace-nowrap">
                      <Pill tone="neutral">Out of date</Pill>
                    </span>
                  ) : a.requiresAck ? (
                    // Quiet once done: the unread messages above are the ones that stand out.
                    <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-ink-muted">
                      <Check aria-hidden size={14} strokeWidth={3} />
                      Read
                    </span>
                  ) : null}
                </div>
                <h2 className={`text-[17px] leading-[23px] font-bold ${outOfDate(a) ? "text-ink-muted line-through decoration-1" : ""}`}>{a.title}</h2>
                <p className="text-[16px] leading-6 whitespace-pre-line text-ink-muted">{a.body}</p>
                <MediaGallery items={a.media} label={a.title} />
                {outOfDate(a) ? <SessionNow session={a.session!} now={now} /> : null}
                {a.quickAnswers && a.reaches.length ? <Answers a={a} family={family} /> : canAnswerComing(a.session) ? <ComingOnNews session={a.session} family={family} now={now} /> : null}
                <ReplyLink a={a} />
              </ReadFocus>
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}

/** A session notice with a newer notice about the same session after it. */
const outOfDate = (a: AnnouncementView) => Boolean(a.session && a.session.notice !== "attendance" && !a.session.latest);

/** The quick-answer buttons for each of the family's children the message reaches (one child: plain "Yes"/"No"). */
function Answers({ a, family }: { a: AnnouncementView; family: Family }) {
  const several = a.reaches.length > 1;
  const rows = a.reaches.flatMap((id) => {
    const child = family.children.find((c) => c.id === id);
    if (!child) return [];
    const given = a.answers[id];
    return [{ childId: id, childName: several ? child.firstName : null, answer: given?.answer ?? null, answeredBy: given && !given.mine ? given.byName : null }];
  });
  return <QuickAnswers announcementId={a.id} title={a.title} options={a.quickAnswers ?? []} rows={rows} />;
}

/** "Reply to Coach Monju": starts (or opens) a conversation with whoever posted it, about the child it's for. */
function ReplyLink({ a }: { a: AnnouncementView }) {
  if (!a.allowReplies || a.reaches.length === 0) return null;
  if (a.replied) {
    // Already answered: say so, and open that conversation.
    return (
      <Link
        href={`/messages/${a.replied.conversation}`}
        aria-label={`You replied, ${postedLabel(a.replied.at, new Date())}. Open the conversation: ${a.title}`}
        className="inline-flex min-h-12 items-center gap-2 self-start text-[15px] text-ink-muted"
      >
        <Check aria-hidden size={16} strokeWidth={3} />
        You replied · {postedLabel(a.replied.at, new Date())}
        <span className="font-bold text-grass-text underline">Open</span>
      </Link>
    );
  }
  const href = `/messages/new?about=${a.id}${a.reaches.length === 1 ? `&child=${a.reaches[0]}` : ""}`;
  return (
    <Link
      href={href}
      aria-label={`Reply to ${a.postedBy ?? "the club"}: ${a.title}`}
      className="inline-flex min-h-12 items-center gap-2 self-start text-[15px] font-bold text-grass-text underline"
    >
      <Reply aria-hidden size={18} />
      Reply to {a.postedBy ?? "the club"}
    </Link>
  );
}
