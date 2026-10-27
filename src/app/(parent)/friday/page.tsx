import type { Metadata } from "next";
import { staffNameForParents } from "@/lib/greeting";
import type { ReactNode } from "react";
import Link from "next/link";
import { TripCards } from "@/components/TripCards";
import { BookOpen, CalendarX, ChevronDown, ChevronRight, ClipboardList, Clock, ExternalLink, Info, MapPin, MoonStar, QrCode, Shirt } from "lucide-react";
import { AddToCalendar, AvailabilityPicker, type CalendarLinks } from "@/components/AvailabilityPicker";
import { CheckedIn } from "@/components/CheckedIn";
import { PassCacheWriter } from "@/components/PassCacheWriter";
import { PassCarousel } from "@/components/PassCarousel";
import { Attachment } from "@/components/plans/Attachment";
import { VideoCard } from "@/components/plans/VideoCard";
import { VenuePassPicture } from "@/components/VenuePassPicture";
import { AppHeader, Card, Eyebrow, Pill } from "@/components/ui";
import { androidCalendarIntent, googleCalendarUrl, sessionIcsOpenPath, sessionIcsPath } from "@/lib/calendar/session";
import { appUrl } from "@/lib/config";
import { clock, dayHeading, longDay, shortDay, whenWords } from "@/lib/dates";
import { attachmentTitle } from "@/lib/files";
import { groupPlural, type Session } from "@/lib/domain";
import type { SquadCounts } from "@/lib/parent/data";
import { getFamily, getFridayPage } from "@/lib/parent/load";
import { answeredLine, availabilityQuestion, directionsUrl, sessionsToday, type ChildWeek, type SquadInvite } from "@/lib/parent/views";
import { cachedPasses, passCards, type PassCard } from "@/lib/pass/cards";
import type { SessionPlan } from "@/lib/plans/data";
import type { VenuePassView } from "@/lib/venue-pass/card";

export const metadata: Metadata = { title: "Sessions" };

export default async function FridayPage() {
  const [{ family, week, cancelled, invites, upcoming, plans, latestSheet, venuePass, trips }, { user }] = await Promise.all([getFridayPage(), getFamily()]);
  const single = week.length === 1 ? week[0] : null;
  // Every child's QR code is kept on the phone for no signal; on a session day, today's children's codes are shown here too.
  const cards = await passCards(family.children);
  const now = new Date();
  // The next session going ahead, named on a cancelled card so it's never mistaken for the cancelled one.
  const nextUp = week.flatMap((w) => (w.session && !w.session.cancelled ? [w.session] : [])).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  const today = sessionsToday(week, now);
  /** "Coming · answered by Sara, Tue 2:02pm" (or "by you") under an answer that's already been given. */
  const answered = (w: { answered?: ChildWeek["answered"]; session?: Session }) =>
    w.answered ? answeredLine(w.answered, family.guardian.id, now, Boolean(w.session?.squad)) : undefined;
  const todayCards = cards.filter((c) => today.some((t) => t.child.id === c.id));
  const sessions = uniqueSessions(week);
  /** "Add to calendar" for a session the family says they're coming to, named with every child of theirs it's for. */
  const calendar = (s: Session): CalendarLinks | undefined => {
    if (s.cancelled) return undefined;
    const children = [...new Set([...week.filter((w) => w.session?.id === s.id), ...invites.filter((i) => i.session.id === s.id)].map((x) => x.child.firstName))].sort();
    const event = {
      id: s.id,
      title: s.title,
      startsAt: new Date(s.startsAt),
      endsAt: new Date(s.endsAt),
      venue: s.venue,
      children,
      arriveBy: s.arriveBy,
      kit: s.kit,
      notes: s.notes,
      cancelled: false,
      cancelReason: null,
    };
    const base = appUrl();
    return {
      google: googleCalendarUrl(event),
      ics: sessionIcsPath(s.id),
      icsOpen: sessionIcsOpenPath(s.id),
      android: androidCalendarIntent(event, base ? `${base}${sessionIcsPath(s.id)}` : null),
      label: `${s.title}, ${shortDay(s.startsAt)}`,
    };
  };

  return (
    <>
      {single?.session ? (
        <AppHeader stripes>
          <p className="text-label text-floodlight uppercase">
            {longDay(single.session.startsAt)} · {groupPlural(single.child.ageGroup)}
          </p>
          <h1 className="font-display text-[48px] leading-[0.92] tracking-[0.02em]">
            {single.checkedInAt
              ? `${single.child.firstName} is here`
              : single.session.squad
                ? `Can ${single.child.firstName} play ${whenWords(single.session.startsAt, now)}?`
                : `Is ${single.child.firstName} coming ${whenWords(single.session.startsAt, now)}?`}
          </h1>
          <p className="text-sm text-on-pitch-muted">
            {single.session.squad ? `${single.session.title} · ` : ""}
            {clock(single.session.startsAt)}–{clock(single.session.endsAt)} · {single.session.venue}
          </p>
        </AppHeader>
      ) : (
        <AppHeader stripes>
          <p className="text-label text-floodlight uppercase">Next sessions</p>
          <h1 className="font-display text-[48px] leading-[0.92] tracking-[0.02em]">{single ? "Sessions" : "Who's coming?"}</h1>
        </AppHeader>
      )}

      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        <PassCacheWriter user={user.id} passes={cachedPasses(cards)} hub={venuePass?.cache ?? null} />
        <TripCards trips={trips} from="/friday" />
        {todayCards.length > 0 ? (
          <TodaysCodes cards={todayCards} title={today[0].session.title} venuePass={venuePass} />
        ) : family.children.length > 0 ? (
          <Link href="/pass" className="flex items-center gap-3 rounded-app bg-pitch-deep px-3.5 py-3 text-on-pitch">
            {/* The icon steps aside on a very narrow screen (200% zoom), so the heading's words fit whole rather than breaking mid-word. */}
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-floodlight text-on-gold max-[239px]:hidden">
              <QrCode aria-hidden size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">{family.children.length > 1 ? "Attendance QR codes" : "Attendance QR code"}</span>
              {/* Only this line can hold a long name, so only it may break inside a word. */}
              <span className="text-[13px] break-words text-on-pitch-muted">{family.children.length > 1 ? "One for each child. Show it to the coach when you arrive" : `Show it to the coach to check ${family.children[0].firstName} in`}</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-on-pitch-muted" />
          </Link>
        ) : null}
        {family.children.length === 0 ? (
          <Card className="p-4 text-[15px] leading-[22px]">No players are linked to your email yet. Ask the club to add your child.</Card>
        ) : null}

        {/* A cancelled session never hides the next one: it shows here, and the next one is asked about below. */}
        {cancelled.map((s) => (
          <Cancelled key={s.id} session={s} now={now} next={nextUp} />
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
              reason={single.answered?.reason ?? null}
              calendar={calendar(single.session)}
            />
          ) : (
            <NoSession name={single.child.firstName} />
          )
        ) : (
          // Several children: one block per session (date, time and venue said once), a row per child, one calendar.
          <>
            {sessions.map((s) => (
              <SessionBlock key={s.id} session={s} now={now} rows={week.filter((w) => w.session?.id === s.id)} answered={answered} calendar={calendar(s)} />
            ))}
            {week
              .filter((w) => !w.session)
              .map((w) => (
                <NoSession key={w.child.id} name={w.child.firstName} />
              ))}
          </>
        )}

        {invites.map((i) => (
          <InviteCard key={`${i.session.id}:${i.child.id}`} invite={i} answered={answered(i)} calendar={calendar(i.session)} />
        ))}

        {single?.session ? <Briefing session={single.session} /> : null}

        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} sessionLabel={sessions.length > 1 ? sessions.find((s) => s.id === p.sessionId) : undefined} />
        ))}

        {latestSheet ? (
          <div className="flex flex-col gap-2">
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
            {/* The latest sheet's video plays here too, so a child can follow it without another screen. */}
            {latestSheet.video ? <VideoCard video={latestSheet.video} name={latestSheet.title} /> : null}
          </div>
        ) : null}

        {single?.session && single.counts ? (
          <Headcount group={single.child.ageGroup} counts={single.counts} squad={Boolean(single.session.squad)} />
        ) : null}

        {upcoming.length > 0 ? (
          <section aria-labelledby="coming-up" className="flex flex-col gap-2">
            <Eyebrow>
              <span id="coming-up">Coming up</span>
            </Eyebrow>
            <ul className="flex flex-col divide-y-2 divide-line rounded-app border-2 border-line bg-paper px-3.5">
              {upcoming.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
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
                  {s.cancelled ? <Pill tone="action">Cancelled</Pill> : <span className="shrink-0 text-[13px] font-bold text-ink-muted">{s.ageGroups.join(", ")}</span>}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {week.some((w) => w.answer === "coming") ? null : (
          <Link href="/player/calendar?from=/friday" className="inline-flex min-h-12 items-center self-start text-sm font-bold text-grass-text underline">
            Add sessions to your calendar
          </Link>
        )}
      </main>
    </>
  );
}

/** On a session day: the children's QR codes on Friday itself, one tap to open (they're in the page, so no signal needed). */
function TodaysCodes({ cards, title, venuePass }: { cards: PassCard[]; title: string; venuePass: VenuePassView | null }) {
  const several = cards.length > 1;
  return (
    <details className="group rounded-app bg-pitch-deep text-on-pitch">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-app px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-floodlight text-on-gold max-[239px]:hidden">
          <QrCode aria-hidden size={24} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold">{several ? "Show attendance QR codes" : "Show attendance QR code"}</span>
          <span className="text-[13px] break-words text-on-pitch-muted">
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
        {/* The parent's own entry code for the sports hub, ready at the same gate. Added and changed on /pass. */}
        <section aria-labelledby="friday-hub-code" className="flex w-full flex-col items-center gap-2 border-t-2 border-line px-2 pt-3 pb-2">
          <h2 id="friday-hub-code" className="text-[17px] font-extrabold">
            Your sports hub entry code
          </h2>
          {venuePass ? (
            <VenuePassPicture view={venuePass} />
          ) : (
            <Link href="/pass" className="inline-flex min-h-12 items-center text-center text-sm font-bold text-grass-text underline">
              Add your sports hub entry code
            </Link>
          )}
        </section>
      </div>
    </details>
  );
}

function uniqueSessions(week: ChildWeek[]): Session[] {
  const seen = new Map<string, Session>();
  for (const w of week) if (w.session) seen.set(w.session.id, w.session);
  return [...seen.values()];
}

/**
 * One session for a family with several children: what, when and where once, then a row per child with their
 * group's headcount and Coming / Not coming, then one Add to my calendar (once anyone is coming) and the briefing.
 */
function SessionBlock({
  session,
  now,
  rows,
  answered,
  calendar,
}: {
  session: Session;
  now: Date;
  rows: ChildWeek[];
  answered: (w: ChildWeek) => string | undefined;
  calendar?: CalendarLinks;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[19px] font-extrabold">
          {dayHeading(session.startsAt, now)} · {session.title}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <p className="text-sm text-ink-muted">
            {clock(session.startsAt)}–{clock(session.endsAt)} · {session.venue}
          </p>
          <Directions venue={session.venue} />
        </div>
      </div>
      <ul className="flex flex-col divide-y-2 divide-line">
        {rows.map((w) => (
          <li key={w.child.id} className="flex flex-col gap-2 py-3 first:pt-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[17px] font-extrabold">
                {w.child.firstName} <span className="text-[15px] font-bold text-ink-muted">· {groupPlural(w.child.ageGroup)}</span>
              </h3>
              {w.counts ? (
                <span className="text-[13px] text-ink-muted tabular-nums">
                  {w.counts.coming} of {w.counts.squad} coming
                </span>
              ) : null}
            </div>
            {w.checkedInAt ? (
              <CheckedIn name={w.child.firstName} at={w.checkedInAt} />
            ) : (
              <AvailabilityPicker
                sessionId={session.id}
                playerId={w.child.id}
                answer={w.answer}
                childName={w.child.firstName}
                question={availabilityQuestion(w.child.firstName, session, shortDay(session.startsAt))}
                squad={Boolean(session.squad)}
                answered={answered(w)}
                reason={w.answered?.reason ?? null}
                compact
              />
            )}
          </li>
        ))}
      </ul>
      {calendar && rows.some((w) => w.answer === "coming") ? <AddToCalendar links={calendar} /> : null}
      <BriefingDetails session={session} />
    </Card>
  );
}

/** A squad session further ahead than the child's next session: the family is asked straight away. */
function InviteCard({ invite: { child, session, answer, answered: record }, answered, calendar }: { invite: SquadInvite; answered?: string; calendar?: CalendarLinks }) {
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
      <AvailabilityPicker sessionId={session.id} playerId={child.id} answer={answer} childName={child.firstName} question={question} squad answered={answered} reason={record?.reason ?? null} calendar={calendar} compact />
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

function briefingRows(session: Session): BriefingRow[] {
  const rows: (BriefingRow | null)[] = [
    session.venue ? { icon: MapPin, text: session.venue, extra: <Directions venue={session.venue} /> } : null,
    session.arriveBy || session.prayerNote
      ? { icon: Clock, text: [session.arriveBy ? `Arrive ${session.arriveBy}` : null, session.prayerNote].filter(Boolean).join(" · ") }
      : null,
    session.kit ? { icon: Shirt, text: session.kit } : null,
  ];
  return rows.filter((r): r is BriefingRow => r !== null);
}

/** The session's notes, always shown (they change week to week), then the usual venue, times and kit, folded away. */
function BriefingDetails({ session }: { session: Session }) {
  const rows = briefingRows(session);
  return (
    <>
      {session.notes ? (
        <p className="flex items-start gap-3 text-[15px] leading-[22px] whitespace-pre-line">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold-tint text-gold-text">
            <Info aria-hidden size={20} />
          </span>
          <span className="min-w-0 flex-1 break-words">{session.notes}</span>
        </p>
      ) : null}
      {rows.length > 0 ? (
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1.5 text-[15px] font-bold text-grass-text [&::-webkit-details-marker]:hidden">
            Venue, times and kit
            <ChevronDown aria-hidden size={18} className="transition-transform group-open:rotate-180" />
          </summary>
          <ul className="flex flex-col gap-3 pt-1 text-[15px]">
            {rows.map(({ icon: Icon, text, extra }) => (
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
        </details>
      ) : null}
    </>
  );
}

/** The briefing under a single child's answer. */
function Briefing({ session }: { session: Session }) {
  if (!session.notes && briefingRows(session).length === 0) return null;
  return (
    <Card className="flex flex-col gap-2 p-4">
      <h2 className="text-base font-extrabold">{session.title} briefing</h2>
      <BriefingDetails session={session} />
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

/**
 * A cancelled session, said in words that can't be read as the next one: "Today's session is cancelled" (or
 * "Cancelled: Training, this Wednesday"), the reason staff gave, and when the next session is. Parents read the old
 * "Cancelled: …, Fri 23 Oct" above "Is Zakariya coming?" as being asked about today.
 */
function Cancelled({ session, now, next }: { session: Session; now: Date; next: Session | null }) {
  const when = whenWords(session.startsAt, now);
  const groups = session.squad ? "" : ` · ${session.ageGroups.join(", ")}`;
  return (
    <div className="flex items-start gap-3 rounded-app border-2 border-kit-orange bg-paper p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-tint text-kit-orange">
        <CalendarX aria-hidden size={22} />
      </span>
      <p className="flex min-w-0 flex-col text-[15px] leading-[22px]">
        <span className="text-[17px] font-extrabold">
          {when === "today" ? "Today's session is cancelled" : when === "tomorrow" ? "Tomorrow's session is cancelled" : `Cancelled: ${session.title}, ${when.replace(/^on /, "")}${groups}`}
        </span>
        {when === "today" || when === "tomorrow" ? (
          <span className="text-ink-muted">
            {session.title}
            {groups}
          </span>
        ) : null}
        {session.cancelReason ? <span>{session.cancelReason}</span> : null}
        {next ? <span className="font-bold">Next session: {longDay(next.startsAt)}</span> : null}
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
      <p className="text-[15px] leading-[22px]">No sessions for {name}&apos;s group yet.</p>
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
      {plan.video ? <VideoCard video={plan.video} name={`${plan.ageGroup} session plan`} title="Session plan video" /> : null}
      {plan.from ? <p className="text-[13px] text-ink-muted">From {staffNameForParents(plan.from)}</p> : null}
    </Card>
  );
}
