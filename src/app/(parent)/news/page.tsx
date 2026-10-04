import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Flame, Mic } from "lucide-react";
import { AcknowledgeButton } from "@/components/AcknowledgeButton";
import { AppHeader, Card, Eyebrow, Pill } from "@/components/ui";
import { getParentView } from "@/lib/data";
import { clock, postedLabel } from "@/lib/dates";

export const metadata: Metadata = { title: "Club news" };

export default async function NewsPage() {
  const view = await getParentView();
  const now = new Date();
  const unread = view.news.filter((a) => !a.read);
  const earlier = view.news.filter((a) => a.read);
  const { session, answer } = view.friday;
  const child = view.player.firstName;

  return (
    <>
      <AppHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/crest.png" alt="Deen Squad crest" width={44} height={44} className="rounded-[10px]" priority />
            <div>
              <p className="text-[13px] text-on-pitch-muted">Assalamu alaikum, {view.guardian.firstName}</p>
              <h1 className="font-display text-[34px] leading-none tracking-[0.02em]">Club news</h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-pitch-deep px-3 py-2 text-[13px] font-bold text-floodlight">
            <Flame aria-hidden size={16} fill="currentColor" strokeWidth={0} />
            {view.stats.streakWeeks} wk<span className="sr-only"> attendance streak</span>
          </span>
        </div>
        <Link href="/friday" className="flex items-center gap-3 rounded-app bg-pitch-deep px-3.5 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-floodlight font-display text-[22px] leading-none text-on-gold">
            FRI
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-bold">
              {session.title} {clock(session.startsAt)} ·{" "}
              {answer === "coming" ? `${child} is coming` : answer === "away" ? `${child} is away` : `Is ${child} coming?`}
            </span>
            <span className="text-[13px] text-on-pitch-muted">
              {session.venue} · arrive {session.briefing?.arriveBy}
            </span>
          </span>
          <ChevronRight aria-hidden size={20} className="shrink-0 text-on-pitch-muted" />
        </Link>
      </AppHeader>

      <main className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
        {unread.length > 0 ? (
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
                <p className="text-[15px] leading-[22px]">{a.body}</p>
                {a.voiceNote ? (
                  <p className="flex items-center gap-2.5 rounded-pill border border-line bg-paper py-1.5 pr-3 pl-1.5 text-[13px] text-ink-muted">
                    <span className="grid h-8 w-8 place-items-center rounded-pill bg-pitch text-on-pitch">
                      <Mic aria-hidden size={15} />
                    </span>
                    Voice note · {a.voiceNote.from} · 0:{String(a.voiceNote.durationSec).padStart(2, "0")}
                  </p>
                ) : null}
                <AcknowledgeButton announcementId={a.id} />
              </Card>
            ))}
          </section>
        ) : (
          <Card tone="grass" className="flex items-center gap-3 p-4">
            <span className="text-[15px] font-bold text-grass-text">You&apos;re all caught up. Nothing needs your tap.</span>
          </Card>
        )}

        {earlier.length > 0 ? (
          <section aria-labelledby="earlier" className="mt-1 flex flex-col gap-3">
            <Eyebrow>
              <span id="earlier">Earlier</span>
            </Eyebrow>
            {earlier.map((a) => (
              <Card key={a.id} className="flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink-muted">
                    {a.topic} · {a.audience === "all" ? "All groups" : a.audience.join(", ")} · {postedLabel(a.postedAt, now)}
                  </span>
                  <Pill tone="done" icon>
                    Read
                  </Pill>
                </div>
                <h2 className="text-base leading-[22px] font-bold">{a.title}</h2>
                <p className="text-[14px] leading-5 text-ink-muted">{a.body}</p>
              </Card>
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}
