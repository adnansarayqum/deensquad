import Link from "next/link";
import { CalendarX, CheckCircle2, ChevronRight, ListChecks, QrCode, Shirt } from "lucide-react";
import { AllComing } from "./AllComing";
import { AvailabilityPicker } from "./AvailabilityPicker";
import { CheckedIn } from "./CheckedIn";
import { Directions } from "./Directions";
import { Card, Pill } from "./ui";
import { clock, dayHeading, shortDay } from "@/lib/dates";
import { groupPlural, type Session } from "@/lib/domain";
import type { Family } from "@/lib/parent/data";
import { answeredLine, availabilityQuestion, sessionsToday, type ChildWeek } from "@/lib/parent/views";

/**
 * The first thing on News: is training on, when and where, and each child's Coming / Not coming, answerable right
 * here (with "All coming" for several children). On a session day the QR codes are one tap away, and anything still
 * to set up is the last line. Everything else about the session (kit, plan, calendar) stays on Sessions.
 */
export function ThisWeek({ family, week, stepsLeft, now }: { family: Family; week: ChildWeek[]; stepsLeft: number; now: Date }) {
  const sessions = [...new Map(week.flatMap((w) => (w.session ? [[w.session.id, w.session] as const] : []))).values()].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const cancelled = [...new Map(week.flatMap((w) => w.cancelled.map((s) => [s.id, s] as const))).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (family.children.length === 0) return null;
  const today = sessionsToday(week, now);
  const several = family.children.length > 1;
  const qrLabel = several ? "Show QR codes" : "Show QR code";

  return (
    <Card className="flex flex-col gap-5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="this-week" className="text-[20px] leading-7 font-bold">
          This week
        </h2>
        {sessions.length ? (
          <Link href="/friday" className="inline-flex min-h-12 items-center gap-1 text-[15px] font-bold text-grass-text">
            Kit and details
            <ChevronRight aria-hidden size={16} />
          </Link>
        ) : null}
      </div>

      {/* A cancelled session never hides the next one: it's said first, in words, then the next one is asked about. */}
      {cancelled.map((s) => (
        <div key={s.id} role="status" className="flex items-start gap-3 rounded-app bg-orange-tint px-3.5 py-3 text-ink">
          <CalendarX aria-hidden size={22} className="mt-0.5 shrink-0 text-kit-orange" />
          <p className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[16px] font-bold">
              Cancelled: {s.title} · {dayHeading(s.startsAt, now)}
            </span>
            {s.cancelReason ? <span className="text-[15px] break-words">{s.cancelReason}</span> : null}
          </p>
        </div>
      ))}

      {sessions.map((s) => (
        <SessionPart key={s.id} session={s} rows={week.filter((w) => w.session?.id === s.id)} family={family} now={now} />
      ))}
      {sessions.length === 0 ? <p className="text-[16px] text-ink-muted">No sessions coming up yet. They&apos;ll show here as soon as the club adds them.</p> : null}

      {today.length ? (
        <Link
          href="/pass?from=/news"
          aria-label={`${qrLabel}: ${today[0].session.title} today`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-app bg-floodlight px-4 text-[16px] font-bold text-on-gold transition-transform active:translate-y-0.5"
        >
          <QrCode aria-hidden size={20} />
          {qrLabel}
        </Link>
      ) : null}

      {stepsLeft > 0 ? (
        <Link href="/checklist" className="flex items-center gap-3 rounded-app border border-kit-orange bg-orange-tint px-3.5 py-3 text-ink transition-transform active:translate-y-1">
          <ListChecks aria-hidden size={22} className="shrink-0 text-kit-orange" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[16px] font-bold">{stepsLeft === 1 ? "1 thing left to set up" : `${stepsLeft} things left to set up`}</span>
            <span className="text-[15px]">For {several ? "your children" : family.children[0]?.firstName}: open your To-do list</span>
          </span>
          <ChevronRight aria-hidden size={20} className="shrink-0" />
        </Link>
      ) : (
        // Nothing left to set up: a quiet line, with the To-do still a tap away to look over.
        <Link href="/checklist" className="inline-flex min-h-12 items-center gap-2 self-start text-[15px] font-bold text-grass-text">
          <CheckCircle2 aria-hidden size={18} />
          Everything&apos;s set up
          <span className="font-normal text-ink-muted underline">Review</span>
        </Link>
      )}
    </Card>
  );
}

/** "Green top · shin pads, water bottle" → ["Green top", "Shin pads", "Water bottle"], for chips. */
export function kitItems(kit: string): string[] {
  return kit
    .split(/\s*(?:·|,|;|\/|\band\b|\+)\s*/i)
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => k[0].toUpperCase() + k.slice(1))
    .slice(0, 8);
}

function SessionPart({ session, rows, family, now }: { session: Session; rows: ChildWeek[]; family: Family; now: Date }) {
  const open = rows.filter((w) => !w.checkedInAt);
  const notYetComing = open.filter((w) => w.answer !== "coming").map((w) => w.child);
  return (
    <section aria-label={`${dayHeading(session.startsAt, now)}, ${session.title}`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-app bg-cream p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 className="text-[18px] leading-6 font-bold">
            {dayHeading(session.startsAt, now)} · {session.title}
          </h3>
          <Pill tone="done">Going ahead</Pill>
        </div>
        <div className="flex flex-col">
          <p className="text-[16px] leading-6 font-bold tabular-nums">
            {clock(session.startsAt)}–{clock(session.endsAt)}
            {session.arriveBy ? <span className="font-normal text-ink-muted"> · arrive by {session.arriveBy}</span> : null}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <p className="min-w-0 text-[15px] leading-[22px] text-ink-muted">{session.venue}</p>
            <Directions venue={session.venue} />
          </div>
        </div>
        {session.kit ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="inline-flex items-center gap-1 pr-1 text-[13px] font-bold text-ink-muted">
              <Shirt aria-hidden size={14} />
              Bring
            </span>
            {kitItems(session.kit).map((k) => (
              <span key={k} className="inline-flex min-h-8 items-center gap-1 rounded-pill border border-line bg-paper px-2.5 text-[15px] font-medium">
                {k}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {/* "All coming" only where it saves taps: two or more children here who haven't said Coming yet. */}
      {!session.squad && notYetComing.length > 1 ? <AllComing sessionId={session.id} kids={notYetComing} /> : null}
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((w) => (
          <li key={w.child.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
            {rows.length > 1 || family.children.length > 1 ? (
              <p className="text-[16px] font-bold">
                {w.child.firstName} <span className="font-normal text-ink-muted">{groupPlural(w.child.ageGroup)}</span>
              </p>
            ) : null}
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
                answered={w.answered ? answeredLine(w.answered, family.guardian.id, now, Boolean(session.squad)) : undefined}
                reason={w.answered?.reason ?? null}
                compact
                quiet
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
