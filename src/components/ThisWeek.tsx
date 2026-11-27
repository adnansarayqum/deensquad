import { WeekFold } from "./WeekFold";
import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarX, Check, ChevronDown, ChevronRight, ListChecks, QrCode, Shirt } from "lucide-react";
import { AllComing } from "./AllComing";
import { AvailabilityPicker } from "./AvailabilityPicker";
import { CheckedIn } from "./CheckedIn";
import { Directions } from "./Directions";
import { EmptyState } from "./EmptyState";
import { Card, Pill } from "./ui";
import { clock, dayHeading, shortDay, whenWords } from "@/lib/dates";
import { groupPlural, type Session } from "@/lib/domain";
import type { Family } from "@/lib/parent/data";
import { answeredLine, availabilityQuestion, sessionsToday, type ChildWeek } from "@/lib/parent/views";

/**
 * The first thing on News: is training on, when and where, and each child's Coming / Not coming, answerable right
 * here (with "Mark both as coming" for several children). On a session day the QR codes are one tap away, and anything still
 * to set up is the last line (nothing once it's all done: the To-do tab is always there). Everything else about the session (kit, plan, calendar) stays on Sessions.
 */
/** `todoCalm`: something more urgent on Home has the orange (`homeLead`), so the set-up line is drawn neutral. */
export function ThisWeek({
  family,
  week,
  stepsLeft,
  now,
  todoCalm = false,
  sponsor,
}: {
  family: Family;
  week: ChildWeek[];
  stepsLeft: number;
  now: Date;
  todoCalm?: boolean;
  /** The week's sponsor line, when the club has sponsors: one quiet row above the set-up line. */
  sponsor?: ReactNode;
}) {
  const sessions = [...new Map(week.flatMap((w) => (w.session ? [[w.session.id, w.session] as const] : []))).values()].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const cancelled = [...new Map(week.flatMap((w) => w.cancelled.map((s) => [s.id, s] as const))).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (family.children.length === 0) return null;
  const today = sessionsToday(week, now);
  const several = family.children.length > 1;
  const qrLabel = several ? "Show QR codes" : "Show QR code";

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-2">
        <h2 id="this-week" className="text-heading leading-7 font-bold">
          This week
        </h2>
        {sessions.length ? (
          <Link href="/friday" className="inline-flex min-h-12 items-center gap-1 text-small font-bold text-grass-text">
            Kit and details
            <ChevronRight aria-hidden size={16} />
          </Link>
        ) : null}
      </div>

      {/* A cancelled session never hides the next one: it's said first, in words, then the next one is asked about. */}
      {cancelled.map((s) => (
        <div key={s.id} role="status" className="mx-4 mb-3 flex items-start gap-3 rounded-web bg-orange-tint px-3.5 py-3 text-ink">
          <CalendarX aria-hidden size={24} className="mt-0.5 shrink-0 text-kit-orange" />
          <p className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body font-bold">
              Cancelled: {s.title} · {dayHeading(s.startsAt, now)}
            </span>
            {s.cancelReason ? <span className="text-small break-words">{s.cancelReason}</span> : null}
          </p>
        </div>
      ))}

      {sessions.map((s) => (
        <SessionPart key={s.id} session={s} rows={week.filter((w) => w.session?.id === s.id)} family={family} now={now} />
      ))}
      {sessions.length === 0 ? <EmptyState>No sessions coming up yet. They&apos;ll show here as soon as the club adds them.</EmptyState> : null}

      {today.length ? (
        <div className="border-t border-line px-4 py-3">
        <Link
          href="/pass?from=/news"
          aria-label={`${qrLabel}: ${today[0].session.title} today`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-web bg-floodlight px-4 text-body font-bold text-on-gold transition-transform active:scale-[0.99]"
        >
          <QrCode aria-hidden size={20} />
          {qrLabel}
        </Link>
        </div>
      ) : null}

      {sponsor}

      {stepsLeft > 0 ? (
        <Link href="/checklist" className="flex items-center gap-3 border-t border-line px-4 py-3.5 text-ink">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-web ${todoCalm ? "bg-fill text-ink-muted" : "bg-orange-tint text-kit-orange"}`}>
            <ListChecks aria-hidden size={20} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-bold">{stepsLeft === 1 ? "1 thing left to set up" : `${stepsLeft} things left to set up`}</span>
            <span className="text-small text-ink-muted">For {several ? "your children" : family.children[0]?.firstName}: open your To-do list</span>
          </span>
          <span className={`rounded-pill px-2 py-0.5 text-meta font-bold tabular-nums ${todoCalm ? "bg-fill text-ink" : "bg-kit-orange text-on-orange"}`}>{stepsLeft}</span>
          <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
        </Link>
      ) : null}
    </Card>
  );
}

/** The folded session's day in words: "Today", "This Friday", "Next Friday", else "Fri 6 Nov" (its date tile has the date). */
function foldedDay(iso: string, now: Date): string {
  const words = whenWords(iso, now);
  return words.startsWith("on ") ? shortDay(iso) : words[0].toUpperCase() + words.slice(1);
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
  const start = new Date(session.startsAt);
  const named = rows.length > 1 || family.children.length > 1;
  // Every child answered (or already in): fold the session to one line, so the club's news is on the first screen.
  const settled = rows.length > 0 && rows.every((w) => w.checkedInAt || w.answer);
  const details = (
      <div className="flex gap-3.5 px-4 py-4">
        {/* The date as a tile, like a fixture card: the day's number big, the month small. */}
        <span aria-hidden className="flex h-[60px] w-14 shrink-0 flex-col items-center justify-center rounded-web bg-pitch text-on-pitch">
          <span className="font-display text-[28px] leading-none">{new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Europe/London" }).format(start)}</span>
          <span className="text-meta font-bold text-floodlight">{new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Europe/London" }).format(start).toUpperCase()}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-subhead font-bold">
            {dayHeading(session.startsAt, now)} · {session.title}
          </h3>
          <p className="text-small leading-[22px] text-ink-muted tabular-nums">
            <span className="font-bold text-ink">
              {clock(session.startsAt)}–{clock(session.endsAt)}
            </span>
            {session.arriveBy ? ` · arrive by ${session.arriveBy}` : ""}
            <br />
            {session.venue}
          </p>
          <div className="flex flex-wrap items-center gap-x-3">
            <Pill tone="done" icon>
              Going ahead
            </Pill>
            <Directions venue={session.venue} />
          </div>
          {session.kit ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="inline-flex items-center gap-1 pr-0.5 text-meta font-bold text-ink-muted">
                <Shirt aria-hidden size={16} />
                Bring
              </span>
              {kitItems(session.kit).map((k) => (
                <span key={k} className="inline-flex min-h-7 items-center rounded-pill bg-fill px-2.5 text-small font-medium">
                  {k}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
  );
  const list = (
    <>
      <ul className="flex flex-col divide-y divide-line border-t border-line">
        {rows.map((w) => (
          <li key={w.child.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
            {named ? (
              <p className="flex min-w-0 flex-col">
                <span className="text-body leading-5 font-bold">{w.child.firstName}</span>
                <span className="text-meta text-ink-muted">{groupPlural(w.child.ageGroup)}</span>
              </p>
            ) : null}
            <div className={`min-w-0 ${named ? "flex-1 basis-56" : "w-full"}`}>
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
            </div>
          </li>
        ))}
      </ul>
      {/* "Mark both as coming" only where it saves taps: two or more children here who haven't said Coming yet. */}
      {!session.squad && notYetComing.length > 1 ? (
        <div className="border-t border-line px-4 py-3">
          <AllComing sessionId={session.id} kids={notYetComing} />
        </div>
      ) : null}
    </>
  );
  const label = `${dayHeading(session.startsAt, now)}, ${session.title}`;
  return (
    <section aria-label={label} className="border-t border-line">
      <WeekFold
        settled={settled}
        summary={
          <>
          <span aria-hidden className="flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-web bg-pitch text-on-pitch">
            <span className="font-display text-[22px] leading-none">{new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Europe/London" }).format(start)}</span>
            <span className="text-meta font-bold text-floodlight">{new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Europe/London" }).format(start).toUpperCase()}</span>
          </span>
          {/* The day and time with Change beside them, the answers on a line of their own under both: each fits on
              one line of a phone (the date is on the tile, so the heading needn't repeat it). */}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center justify-between gap-2">
              <span className="text-body leading-6 font-bold whitespace-nowrap">
                {foldedDay(session.startsAt, now)} · {clock(session.startsAt)}
              </span>
              <span className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-pill border border-line pr-2 pl-3 text-small font-bold text-ink">
                <span className="group-open/week:hidden">Change</span>
                <span className="hidden group-open/week:inline">Close</span>
                <ChevronDown aria-hidden size={16} className="transition-transform group-open/week:rotate-180" />
              </span>
            </span>
            <span className="flex items-start gap-1 text-small leading-[22px] font-bold text-grass-text">
              <Check aria-hidden size={16} strokeWidth={3} className="mt-[3px] shrink-0" />
              {answeredSummary(rows)}
            </span>
          </span>
          </>
        }
      >
        {details}
        {list}
      </WeekFold>
    </section>
  );
}

/** "Yusuf and Hudhayfah are coming" / "Yusuf coming · Musa not coming" / "Musa is in", for the folded session. */
export function answeredSummary(rows: Pick<ChildWeek, "child" | "answer" | "checkedInAt">[]): string {
  const name = (w: (typeof rows)[number]) => w.child.firstName;
  const join = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  const inNow = rows.filter((w) => w.checkedInAt).map(name);
  const coming = rows.filter((w) => !w.checkedInAt && w.answer === "coming").map(name);
  const away = rows.filter((w) => !w.checkedInAt && w.answer === "away").map(name);
  const parts: string[] = [];
  if (inNow.length) parts.push(`${join(inNow)} checked in`);
  if (coming.length) parts.push(parts.length || away.length ? `${join(coming)} coming` : `${join(coming)} ${coming.length > 1 ? "are" : "is"} coming`);
  if (away.length) parts.push(parts.length ? `${join(away)} not coming` : `${join(away)} ${away.length > 1 ? "aren't" : "isn't"} coming`);
  return parts.join(" · ");
}
