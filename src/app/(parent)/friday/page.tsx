import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX, ChevronRight, Clock, MoonStar, QrCode, Shirt } from "lucide-react";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { AppHeader, Card, Eyebrow, Pill } from "@/components/ui";
import { clock, shortDay } from "@/lib/dates";
import type { Session } from "@/lib/domain";
import type { SquadCounts } from "@/lib/parent/data";
import { getFridayPage } from "@/lib/parent/load";
import type { ChildWeek } from "@/lib/parent/views";

export const metadata: Metadata = { title: "Friday" };

export default async function FridayPage() {
  const { family, week, upcoming } = await getFridayPage();
  const single = week.length === 1 ? week[0] : null;
  const sessions = uniqueSessions(week);

  return (
    <>
      {single?.session ? (
        <AppHeader stripes>
          <p className="text-label text-floodlight uppercase">
            {shortDay(single.session.startsAt)} · {single.child.ageGroup}s
          </p>
          <h1 className="font-display text-[48px] leading-[0.92] tracking-[0.02em]">
            {single.session.cancelled ? `${single.session.title} cancelled` : `Is ${single.child.firstName} coming?`}
          </h1>
          <p className="text-sm text-on-pitch-muted">
            {clock(single.session.startsAt)}–{clock(single.session.endsAt)} · {single.session.venue}
          </p>
        </AppHeader>
      ) : (
        <AppHeader stripes>
          <p className="text-label text-floodlight uppercase">Next sessions</p>
          <h1 className="font-display text-[48px] leading-[0.92] tracking-[0.02em]">{single ? "Friday" : "Who's coming?"}</h1>
          {week.length > 1 ? <p className="text-sm text-on-pitch-muted">Tap once for each child. Their coach sees it straight away.</p> : null}
        </AppHeader>
      )}

      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        {family.children.length > 0 ? (
          <Link href="/pass" className="flex items-center gap-3 rounded-app bg-pitch-deep px-3.5 py-3 text-on-pitch">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-floodlight text-on-gold">
              <QrCode aria-hidden size={24} />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">{family.children.length > 1 ? "Gate passes" : "Gate pass"}</span>
              <span className="text-[13px] text-on-pitch-muted">{family.children.length > 1 ? "One for each child. Show it at the gate" : `Show it at the gate to check ${family.children[0].firstName} in`}</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-on-pitch-muted" />
          </Link>
        ) : null}
        {family.children.length === 0 ? (
          <Card className="p-4 text-[15px] leading-[22px]">No players are linked to your email yet. Ask the club to add your child.</Card>
        ) : null}

        {single ? (
          single.session ? (
            single.session.cancelled ? (
              <Cancelled session={single.session} />
            ) : (
              <AvailabilityPicker
                sessionId={single.session.id}
                playerId={single.child.id}
                answer={single.answer}
                childName={single.child.firstName}
                question={`Is ${single.child.firstName} coming? ${shortDay(single.session.startsAt)}`}
              />
            )
          ) : (
            <NoSession name={single.child.firstName} />
          )
        ) : (
          week.map((w) => <ChildCard key={w.child.id} week={w} />)
        )}

        {sessions.filter((s) => !s.cancelled).map((s) => (
          <Briefing key={s.id} session={s} labelled={sessions.length > 1} />
        ))}

        {single?.session && !single.session.cancelled && single.counts ? (
          <Headcount group={single.child.ageGroup} counts={single.counts} />
        ) : null}

        {upcoming.length > 0 ? (
          <section aria-labelledby="coming-up" className="flex flex-col gap-2">
            <Eyebrow>
              <span id="coming-up">Coming up</span>
            </Eyebrow>
            {upcoming.map((s) => (
              <Card key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-bold">
                    {shortDay(s.startsAt)} · {s.title}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {clock(s.startsAt)} · {s.venue}
                  </span>
                </div>
                {s.cancelled ? <Pill tone="action">Cancelled</Pill> : <Pill tone="neutral">{s.ageGroups.join(", ")}</Pill>}
              </Card>
            ))}
          </section>
        ) : null}
      </main>
    </>
  );
}

function uniqueSessions(week: ChildWeek[]): Session[] {
  const seen = new Map<string, Session>();
  for (const w of week) if (w.session) seen.set(w.session.id, w.session);
  return [...seen.values()];
}

function ChildCard({ week: w }: { week: ChildWeek }) {
  const name = w.child.firstName;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[19px] font-extrabold">
          {name} <span className="text-[15px] font-bold text-ink-muted">· {w.child.ageGroup}s</span>
        </h2>
        {w.counts && w.session && !w.session.cancelled ? (
          <span className="text-[13px] text-ink-muted tabular-nums">
            {w.counts.coming} of {w.counts.squad} coming
          </span>
        ) : null}
      </div>
      {w.session ? (
        <>
          <p className="-mt-1.5 text-sm text-ink-muted">
            {shortDay(w.session.startsAt)} · {clock(w.session.startsAt)}–{clock(w.session.endsAt)} · {w.session.venue}
          </p>
          {w.session.cancelled ? (
            <p className="rounded-xl bg-orange-tint px-3 py-2.5 text-[15px] font-bold text-ink">This session is cancelled.</p>
          ) : (
            <AvailabilityPicker
              sessionId={w.session.id}
              playerId={w.child.id}
              answer={w.answer}
              childName={name}
              question={`Is ${name} coming? ${shortDay(w.session.startsAt)}`}
              compact
            />
          )}
        </>
      ) : (
        <p className="text-[15px] text-ink-muted">No session scheduled for {name}&apos;s group yet.</p>
      )}
    </Card>
  );
}

function Briefing({ session, labelled }: { session: Session; labelled: boolean }) {
  const rows = [
    session.arriveBy || session.prayerNote
      ? { icon: Clock, text: [session.arriveBy ? `Arrive ${session.arriveBy}` : null, session.prayerNote].filter(Boolean).join(" · ") }
      : null,
    session.kit ? { icon: Shirt, text: session.kit } : null,
  ].filter((r): r is { icon: typeof Clock; text: string } => r !== null);
  if (rows.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-extrabold">
        {labelled ? `${shortDay(session.startsAt)} briefing · ${session.ageGroups.join(", ")}` : `${session.title} briefing`}
      </h2>
      <ul className="flex flex-col gap-3 text-[15px]">
        {rows.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold-tint text-gold-text">
              <Icon aria-hidden size={20} />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Headcount({ group, counts }: { group: string; counts: SquadCounts }) {
  const unanswered = Math.max(0, counts.squad - counts.coming - counts.away);
  const total = Math.max(1, counts.squad);
  return (
    <section aria-label={`${group}s this week`} className="flex items-center gap-4 rounded-app bg-pitch-deep p-4 text-on-pitch">
      <span className="font-display text-[56px] leading-[0.9] text-floodlight tabular-nums">{counts.coming}</span>
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="text-[15px] font-bold">{group}s coming this week</span>
        <div className="flex h-2.5 overflow-hidden rounded-pill bg-pitch" aria-hidden>
          <div className="bg-grass" style={{ width: `${(counts.coming / total) * 100}%` }} />
          <div className="bg-kit-orange" style={{ width: `${(counts.away / total) * 100}%` }} />
        </div>
        <span className="text-[13px] text-on-pitch-muted">
          {counts.away} away · {unanswered} still to answer
        </span>
      </div>
    </section>
  );
}

function Cancelled({ session }: { session: Session }) {
  return (
    <div className="flex items-center gap-3 rounded-app border-2 border-kit-orange bg-paper p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-tint text-kit-orange">
        <CalendarX aria-hidden size={24} />
      </span>
      <p className="text-[15px] leading-[22px]">
        <span className="font-bold">{shortDay(session.startsAt)} is cancelled.</span> Check club news for details.
      </p>
    </div>
  );
}

function NoSession({ name }: { name: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-tint text-gold-text">
        <MoonStar aria-hidden size={24} />
      </span>
      <p className="text-[15px] leading-[22px]">No session scheduled for {name}&apos;s group yet. The club will add the dates here.</p>
    </Card>
  );
}
