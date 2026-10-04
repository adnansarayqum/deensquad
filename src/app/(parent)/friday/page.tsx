import type { Metadata } from "next";
import { Clock, CloudRain, Shirt } from "lucide-react";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { AppHeader, Card, Eyebrow, Pill } from "@/components/ui";
import { getParentView } from "@/lib/data";
import { clock, shortDay } from "@/lib/dates";

export const metadata: Metadata = { title: "Friday" };

export default async function FridayPage() {
  const view = await getParentView();
  const { session, answer, counts } = view.friday;
  const child = view.player.firstName;
  const question = `Is ${child} coming?`;
  const total = counts.coming + counts.away + counts.unanswered;

  return (
    <>
      <AppHeader stripes>
        <p className="text-label text-floodlight uppercase">
          {shortDay(session.startsAt)} · {view.player.ageGroup}s
        </p>
        <h1 className="font-display text-[48px] leading-[0.92] tracking-[0.02em]">{question}</h1>
        <p className="text-sm text-on-pitch-muted">
          {clock(session.startsAt)}–{clock(session.endsAt)} · {session.venue}
        </p>
      </AppHeader>

      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        <AvailabilityPicker sessionId={session.id} answer={answer} childName={child} question={`${question} ${shortDay(session.startsAt)}`} />

        {session.briefing ? (
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-base font-extrabold">Friday briefing</h2>
            <ul className="flex flex-col gap-3 text-[15px]">
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold-tint text-gold-text">
                  <Clock aria-hidden size={20} />
                </span>
                Arrive {session.briefing.arriveBy} · {session.briefing.prayer.toLowerCase()}
              </li>
              {session.briefing.weather ? (
                <li className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold-tint text-gold-text">
                    <CloudRain aria-hidden size={20} />
                  </span>
                  {session.briefing.weather}
                </li>
              ) : null}
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold-tint text-gold-text">
                  <Shirt aria-hidden size={20} />
                </span>
                {session.briefing.kit}
              </li>
            </ul>
          </Card>
        ) : null}

        <section aria-label={`${view.player.ageGroup}s this week`} className="flex items-center gap-4 rounded-app bg-pitch-deep p-4 text-on-pitch">
          <span className="font-display text-[56px] leading-[0.9] text-floodlight tabular-nums">{counts.coming}</span>
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-[15px] font-bold">{view.player.ageGroup}s coming this week</span>
            <div className="flex h-2.5 overflow-hidden rounded-pill bg-pitch" aria-hidden>
              <div className="bg-grass" style={{ width: `${(counts.coming / total) * 100}%` }} />
              <div className="bg-kit-orange" style={{ width: `${(counts.away / total) * 100}%` }} />
            </div>
            <span className="text-[13px] text-on-pitch-muted">
              {counts.away} away · {counts.unanswered} still to answer
            </span>
          </div>
        </section>

        {view.upcoming.length > 0 ? (
          <section aria-labelledby="coming-up" className="flex flex-col gap-2">
            <Eyebrow>
              <span id="coming-up">Coming up</span>
            </Eyebrow>
            {view.upcoming.map((s) => (
              <Card key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="flex flex-col">
                  <span className="text-[15px] font-bold">
                    {shortDay(s.startsAt)} · {s.title}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {clock(s.startsAt)} · {s.venue}
                  </span>
                </div>
                <Pill tone="gold">Squad TBC</Pill>
              </Card>
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}
