import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, CalendarX, ChevronDown, ChevronRight, ClipboardList, Clock, ExternalLink, Info, MapPin, MoonStar, QrCode, Shirt } from "lucide-react";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { CheckedIn } from "@/components/CheckedIn";
import { PassCacheWriter } from "@/components/PassCacheWriter";
import { PassCarousel } from "@/components/PassCarousel";
import { Attachment } from "@/components/plans/Attachment";
import { AppHeader, Card, Eyebrow, Pill } from "@/components/ui";
import { clock, shortDay } from "@/lib/dates";
import { attachmentTitle } from "@/lib/files";
import { groupPlural, type Session } from "@/lib/domain";
import type { SquadCounts } from "@/lib/parent/data";
import { getFamily, getFridayPage } from "@/lib/parent/load";
import { answeredLine, availabilityQuestion, directionsUrl, sessionsToday, type ChildWeek, type SquadInvite } from "@/lib/parent/views";
import { cachedPasses, passCards, type PassCard } from "@/lib/pass/cards";
import type { SessionPlan } from "@/lib/plans/data";

export const metadata: Metadata = { title: "Friday" };

export default async function FridayPage() {
  const [{ family, week, cancelled, invites, upcoming, plans, latestSheet }, { user }] = await Promise.all([getFridayPage(), getFamily()]);
  const single = week.length === 1 ? week[0] : null;
  // Every child's QR code is kept on the phone for no signal; on a session day, today's children's codes are shown here too.
  const cards = await passCards(family.children);
  const now = new Date();
  const today = sessionsToday(week, now);
  /** "Coming · answered by Sara, Tue 2:02pm" (or "by you") under an answer that's already been given. */
  const answered = (w: { answered?: ChildWeek["answered"]; session?: Session }) =>
    w.answered ? answeredLine(w.answered, family.guardian.id, now, Boolean(w.session?.squad)) : undefined;
  const todayCards = cards.filter((c) => today.some((t) => t.child.id === c.id));
  const sessions = uniqueSessions(week);

  return (
    <>
      {single?.session ? (
        <AppHeader stripes>
          <p className="text-label text-floodlight uppercase">
            {shortDay(single.session.startsAt)} · {groupPlural(single.child.ageGroup)}
          </p>
          <h1 className="font-display text-[48px] leading-[0.92] tracking-[0.02em]">
            {single.checkedInAt
              ? `${single.child.firstName} is here`
              : single.session.squad
                ? `Can ${single.child.firstName} play?`
                : `Is ${single.child.firstName} coming?`}
          </h1>
          <p className="text-sm text-on-pitch-muted">
            {single.session.squad ? `${single.session.title} · ` : ""}
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
        <PassCacheWriter user={user.id} passes={cachedPasses(cards)} />
        {todayCards.length > 0 ? (
          <TodaysCodes cards={todayCards} title={today[0].session.title} />
        ) : family.children.length > 0 ? (
          <Link href="/pass" className="flex items-center gap-3 rounded-app bg-pitch-deep px-3.5 py-3 text-on-pitch">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-floodlight text-on-gold">
              <QrCode aria-hidden size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col break-words">
              <span className="text-[15px] font-bold">{family.children.length > 1 ? "Attendance QR codes" : "Attendance QR code"}</span>
              <span className="text-[13px] text-on-pitch-muted">{family.children.length > 1 ? "One for each child. Show it to the coach when you arrive" : `Show it to the coach to check ${family.children[0].firstName} in`}</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-on-pitch-muted" />
          </Link>
        ) : null}
        {family.children.length === 0 ? (
          <Card className="p-4 text-[15px] leading-[22px]">No players are linked to your email yet. Ask the club to add your child.</Card>
        ) : null}

        {/* A cancelled session never hides the next one: it shows here, and the next one is asked about below. */}
        {cancelled.map((s) => (
          <Cancelled key={s.id} session={s} />
        ))}

        {single ? (
          single.session && single.checkedInAt ? (
            <CheckedIn name={single.child.firstName} at={single.checkedInAt} />
          ) : single.session ? (
            <AvailabilityPicker
              sessionId={single.session.id}
              playerId={single.child.id}
              answer={single.answer}
              childName={single.child.firstName}
              question={availabilityQuestion(single.child.firstName, single.session, shortDay(single.session.startsAt))}
              squad={Boolean(single.session.squad)}
              answered={answered(single)}
            />
          ) : (
            <NoSession name={single.child.firstName} />
          )
        ) : (
          week.map((w) => <ChildCard key={w.child.id} week={w} answered={answered(w)} />)
        )}

        {invites.map((i) => (
          <InviteCard key={`${i.session.id}:${i.child.id}`} invite={i} answered={answered(i)} />
        ))}

        {sessions.map((s) => (
          <Briefing key={s.id} session={s} labelled={sessions.length > 1} />
        ))}

        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} sessionLabel={sessions.length > 1 ? sessions.find((s) => s.id === p.sessionId) : undefined} />
        ))}

        {latestSheet ? (
          <Link href="/practice" className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-3 shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-grass-tint text-grass-text">
              <BookOpen aria-hidden size={22} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">Practise at home</span>
              <span className="truncate text-[13px] text-ink-muted">Latest: {latestSheet.title}</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
        ) : null}

        {single?.session && single.counts ? (
          <Headcount group={single.child.ageGroup} counts={single.counts} squad={Boolean(single.session.squad)} />
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
                  {s.cancelled && s.cancelReason ? <span className="text-[13px]">{s.cancelReason}</span> : null}
                  {!s.cancelled && s.notes ? <span className="line-clamp-2 text-[13px] whitespace-pre-line">{s.notes}</span> : null}
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

/** On a session day: the children's QR codes on Friday itself, one tap to open (they're in the page, so no signal needed). */
function TodaysCodes({ cards, title }: { cards: PassCard[]; title: string }) {
  const several = cards.length > 1;
  return (
    <details className="group rounded-app bg-pitch-deep text-on-pitch">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-app px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-floodlight text-on-gold">
          <QrCode aria-hidden size={24} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold">{several ? "Show attendance QR codes" : "Show attendance QR code"}</span>
          <span className="text-[13px] text-on-pitch-muted">
            {title} today. Tap to show {several ? "them" : "it"} here for the coach.
          </span>
        </span>
        <ChevronDown aria-hidden size={20} className="shrink-0 text-on-pitch-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mx-2 mb-2 flex flex-col items-center gap-1 rounded-app bg-cream px-2 pt-4 text-ink">
        <PassCarousel cards={cards} />
        <Link href="/pass" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
          Open full screen
        </Link>
      </div>
    </details>
  );
}

function uniqueSessions(week: ChildWeek[]): Session[] {
  const seen = new Map<string, Session>();
  for (const w of week) if (w.session) seen.set(w.session.id, w.session);
  return [...seen.values()];
}

function ChildCard({ week: w, answered }: { week: ChildWeek; answered?: string }) {
  const name = w.child.firstName;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[19px] font-extrabold">
          {name} <span className="text-[15px] font-bold text-ink-muted">· {groupPlural(w.child.ageGroup)}</span>
        </h2>
        {w.counts && w.session ? (
          <span className="text-[13px] text-ink-muted tabular-nums">
            {w.counts.coming} of {w.counts.squad} coming
          </span>
        ) : null}
      </div>
      {w.session ? (
        <>
          <p className="-mt-1.5 text-sm text-ink-muted">
            {w.session.squad ? `${w.session.title} · ` : ""}
            {shortDay(w.session.startsAt)} · {clock(w.session.startsAt)}–{clock(w.session.endsAt)} · {w.session.venue}
          </p>
          {w.checkedInAt ? (
            <CheckedIn name={name} at={w.checkedInAt} />
          ) : (
            <AvailabilityPicker
              sessionId={w.session.id}
              playerId={w.child.id}
              answer={w.answer}
              childName={name}
              question={availabilityQuestion(name, w.session, shortDay(w.session.startsAt))}
              squad={Boolean(w.session.squad)}
              answered={answered}
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

/** A squad session further ahead than the child's next session: the family is asked straight away. */
function InviteCard({ invite: { child, session, answer }, answered }: { invite: SquadInvite; answered?: string }) {
  const question = availabilityQuestion(child.firstName, session, shortDay(session.startsAt));
  return (
    <Card tone="gold" className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <Pill tone="gold">Picked for the squad</Pill>
        {answer ? null : <Pill tone="action">Please answer</Pill>}
      </div>
      <h2 className="text-[19px] leading-[25px] font-extrabold">{question}</h2>
      <div className="-mt-1.5 flex flex-wrap items-center justify-between gap-x-3">
        <p className="text-sm text-ink-muted">
          {clock(session.startsAt)}–{clock(session.endsAt)} · {session.venue}
          {session.arriveBy ? ` · arrive ${session.arriveBy}` : ""}
        </p>
        <Directions venue={session.venue} />
      </div>
      {session.notes ? <p className="-mt-1.5 text-sm whitespace-pre-line">{session.notes}</p> : null}
      <AvailabilityPicker sessionId={session.id} playerId={child.id} answer={answer} childName={child.firstName} question={question} squad answered={answered} compact />
    </Card>
  );
}

/** "Directions" to a session's venue: a Google Maps search, opened outside the app. Nothing while the venue isn't known. */
function Directions({ venue }: { venue: string }) {
  const url = directionsUrl(venue);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      aria-label={`Directions to ${venue}`}
      className="inline-flex min-h-12 shrink-0 items-center gap-1.5 text-[15px] font-bold text-grass-text underline"
    >
      Directions
      <ExternalLink aria-hidden size={16} />
    </a>
  );
}

type BriefingRow = { icon: typeof Clock; text: string; extra?: ReactNode };

function Briefing({ session, labelled }: { session: Session; labelled: boolean }) {
  const rows: (BriefingRow | null)[] = [
    session.venue ? { icon: MapPin, text: session.venue, extra: <Directions venue={session.venue} /> } : null,
    session.arriveBy || session.prayerNote
      ? { icon: Clock, text: [session.arriveBy ? `Arrive ${session.arriveBy}` : null, session.prayerNote].filter(Boolean).join(" · ") }
      : null,
    session.kit ? { icon: Shirt, text: session.kit } : null,
    session.notes ? { icon: Info, text: session.notes } : null,
  ];
  const shown = rows.filter((r): r is BriefingRow => r !== null);
  if (shown.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-extrabold">
        {labelled ? `${shortDay(session.startsAt)} briefing · ${session.ageGroups.join(", ")}` : `${session.title} briefing`}
      </h2>
      <ul className="flex flex-col gap-3 text-[15px]">
        {shown.map(({ icon: Icon, text, extra }) => (
          <li key={text} className="flex flex-wrap items-center gap-3 whitespace-pre-line">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold-tint text-gold-text">
              <Icon aria-hidden size={20} />
            </span>
            <span className="min-w-0 flex-1 break-words">{text}</span>
            {/* Under the text when the screen is very narrow (200% zoom), so it never sits on top of it. */}
            {extra ? <span className="max-[239px]:basis-full max-[239px]:pl-12">{extra}</span> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Headcount({ group, counts, squad }: { group: string; counts: SquadCounts; squad: boolean }) {
  const unanswered = Math.max(0, counts.squad - counts.coming - counts.away);
  const total = Math.max(1, counts.squad);
  return (
    <section aria-label={squad ? `${groupPlural(group)} in the squad` : `${groupPlural(group)} this week`} className="flex items-center gap-4 rounded-app bg-pitch-deep p-4 text-on-pitch">
      <span className="font-display text-[56px] leading-[0.9] text-floodlight tabular-nums">{counts.coming}</span>
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="text-[15px] font-bold">{squad ? `of the ${counts.squad} ${groupPlural(group)} picked can play` : `${groupPlural(group)} coming this week`}</span>
        <div className="flex h-2.5 overflow-hidden rounded-pill bg-pitch" aria-hidden>
          <div className="bg-grass" style={{ width: `${(counts.coming / total) * 100}%` }} />
          <div className="bg-kit-orange" style={{ width: `${(counts.away / total) * 100}%` }} />
        </div>
        <span className="text-[13px] text-on-pitch-muted">
          {counts.away} {squad ? "can't play" : "away"} · {unanswered} still to answer
        </span>
      </div>
    </section>
  );
}

/** "Cancelled: Training, Fri 9 Oct" with the reason staff gave, if any. */
function Cancelled({ session }: { session: Session }) {
  return (
    <div className="flex items-center gap-3 rounded-app border-2 border-kit-orange bg-paper p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-tint text-kit-orange">
        <CalendarX aria-hidden size={22} />
      </span>
      <p className="flex flex-col text-[15px] leading-[22px]">
        <span className="font-bold">
          Cancelled: {session.title}, {shortDay(session.startsAt)}
          {session.squad ? "" : ` · ${session.ageGroups.join(", ")}`}
        </span>
        {session.cancelReason ? <span>{session.cancelReason}</span> : null}
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

function PlanCard({ plan, sessionLabel }: { plan: SessionPlan; sessionLabel?: Session }) {
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-grass-tint text-grass-text">
          <ClipboardList aria-hidden size={20} />
        </span>
        <h2 className="text-[17px] font-extrabold">
          {plan.ageGroup} session plan{sessionLabel ? <span className="font-bold text-ink-muted"> · {shortDay(sessionLabel.startsAt)}</span> : null}
        </h2>
      </div>
      {plan.body ? <p className="text-[15px] leading-[22px] whitespace-pre-line">{plan.body}</p> : null}
      {plan.file ? <Attachment file={plan.file} label={attachmentTitle("plan", plan.file)} from="/friday" /> : null}
      {plan.from ? <p className="text-[13px] text-ink-muted">From {plan.from}</p> : null}
    </Card>
  );
}
