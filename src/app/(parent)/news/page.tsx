import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Flame, QrCode } from "lucide-react";
import { AcknowledgeButton } from "@/components/AcknowledgeButton";
import { NotificationsCard } from "@/components/NotificationsCard";
import { ReadFocus } from "@/components/ReadFocus";
import { AppHeader, Card, Eyebrow, Pill } from "@/components/ui";
import { clock, postedLabel, shortDay } from "@/lib/dates";
import { getNewsPage } from "@/lib/parent/load";
import { sessionsToday, weekSummary } from "@/lib/parent/views";

export const metadata: Metadata = { title: "Club news" };

export default async function NewsPage() {
  const { family, news, week, streakWeeks } = await getNewsPage();
  const now = new Date();
  const unread = news.filter((a) => !a.read);
  const earlier = news.filter((a) => a.read);
  const soonest = week
    .flatMap((w) => (w.session ? [w.session] : []))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  // On a session day the app still opens on News: the first thing on it is the way to the QR code.
  const today = sessionsToday(week, now).sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt))[0];

  return (
    <>
      <AppHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/crest.png" alt="Deen Squad crest" width={44} height={44} className="rounded-[10px]" priority />
            <div>
              <p className="text-[13px] text-on-pitch-muted">Assalamu alaikum, {family.guardian.firstName}</p>
              <h1 className="font-display text-[34px] leading-none tracking-[0.02em]">Club news</h1>
            </div>
          </div>
          {streakWeeks ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-pitch-deep px-3 py-2 text-[13px] font-bold text-floodlight">
              <Flame aria-hidden size={16} fill="currentColor" strokeWidth={0} />
              {streakWeeks} wk<span className="sr-only"> attendance streak</span>
            </span>
          ) : null}
        </div>
        {soonest ? (
          <Link href="/friday" className="flex items-center gap-3 rounded-app bg-pitch-deep px-3.5 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-floodlight font-display text-[22px] leading-none text-on-gold">
              {shortDay(soonest.startsAt).slice(0, 3).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">
                {soonest.cancelled ? `${soonest.title} cancelled` : `${soonest.title} ${clock(soonest.startsAt)} · ${weekSummary(week)}`}
              </span>
              <span className="text-[13px] text-on-pitch-muted">
                {soonest.venue}
                {soonest.arriveBy && !soonest.cancelled ? ` · arrive ${soonest.arriveBy}` : ""}
              </span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-on-pitch-muted" />
          </Link>
        ) : null}
      </AppHeader>

      <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
        {today ? (
          <Link
            href="/pass"
            className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-3 shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-floodlight text-on-gold">
              <QrCode aria-hidden size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">{today.session.title} today: show the QR code</span>
              <span className="text-[13px] text-ink-muted">
                {clock(today.session.startsAt)} · {today.session.venue}
              </span>
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
                    {a.audience === "all" ? "" : ` · ${a.audience.join(", ")}s`}
                  </Pill>
                  <span className="text-[13px] text-ink-muted">{postedLabel(a.postedAt, now)}</span>
                </div>
                <h2 className="text-[19px] leading-[25px] font-bold">{a.title}</h2>
                <p className="text-[15px] leading-[22px] whitespace-pre-line">{a.body}</p>
                {a.postedBy ? <p className="text-[13px] text-ink-muted">From {a.postedBy}</p> : null}
                <AcknowledgeButton announcementId={a.id} title={a.title} />
              </Card>
            ))}
          </section>
        ) : (
          <Card tone="grass" className="flex items-center gap-3 p-4">
            <span className="text-[15px] font-bold text-grass-text">
              {news.length ? "You're all caught up. Nothing needs your tap." : "No club news yet. Messages from the club will appear here."}
            </span>
          </Card>
        )}

        {earlier.length > 0 ? (
          <section aria-labelledby="earlier" className="mt-1 flex flex-col gap-3">
            <Eyebrow>
              <span id="earlier">Earlier</span>
            </Eyebrow>
            {earlier.map((a) => (
              <ReadFocus key={a.id} id={a.id} className="flex flex-col gap-2 rounded-app border-2 border-line bg-paper px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink-muted">
                    {a.topic} · {a.audience === "all" ? "All groups" : a.audience.join(", ")} · {postedLabel(a.postedAt, now)}
                  </span>
                  {a.requiresAck ? (
                    <Pill tone="done" icon>
                      Read
                    </Pill>
                  ) : null}
                </div>
                <h2 className="text-base leading-[22px] font-bold">{a.title}</h2>
                <p className="text-[14px] leading-5 whitespace-pre-line text-ink-muted">{a.body}</p>
              </ReadFocus>
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}
