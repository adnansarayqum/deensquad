import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ClipboardList, Star } from "lucide-react";
import { UndoCheckInButton } from "@/components/CheckInButton";
import { PassScanner } from "@/components/PassScanner";
import { FlagPills, RegisterLists, type GateRow } from "@/components/RegisterLists";
import { Progress } from "@/components/ui";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { registerClosedMessage, registerOpen } from "@/lib/staff/checkin";
import { flagSummary } from "@/lib/staff/flags";
import { ALL_GROUPS, loadRegister, summarise, type RegisterRow } from "@/lib/staff/register";
import { groupPlural } from "@/lib/domain";

export const metadata: Metadata = { title: "Register" };

const gate = (r: RegisterRow): GateRow => ({
  id: r.id,
  firstName: r.firstName,
  lastInitial: r.lastInitial,
  ageGroup: r.ageGroup,
  answer: r.answer,
  checkedIn: r.checkedInAt ? `${r.method === "qr" ? "QR code scanned" : "Marked here"} · ${clock(r.checkedInAt)}` : null,
  flags: r.flags,
});

export default async function CoachRegisterPage({ searchParams }: PageProps<"/coach">) {
  const user = await requireStaff();
  const params = await searchParams;
  const now = new Date();
  const view = await asUser(user.id, (tx) => loadRegister(tx, { now, sessionId: params.session, group: params.group, allowed: staffGroups(user.staff) }));
  const time = clock(now.toISOString());
  const back = user.guardian ? { href: "/player", label: "Parent view" } : { href: "/admin", label: "Club admin" };

  if (!view) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-4 bg-pitch-deep px-4 pt-[max(env(safe-area-inset-top),20px)] text-on-pitch">
        <Link href={back.href} className="mt-4 inline-flex min-h-12 items-center gap-1 self-start text-sm font-bold text-on-pitch-muted">
          <ChevronLeft aria-hidden size={18} />
          {back.label}
        </Link>
        <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.02em]">Register</h1>
        <p className="text-[15px] text-on-pitch-muted">No sessions coming up for your groups. Add the term&apos;s sessions in the club admin.</p>
        <Link href="/coach/awards" className="inline-flex min-h-12 items-center gap-1.5 self-start text-sm font-bold text-floodlight">
          <Star aria-hidden size={16} fill="currentColor" strokeWidth={0} />
          Points and stars
        </Link>
        <Link href="/coach/plans" className="inline-flex min-h-12 items-center gap-1.5 self-start text-sm font-bold text-floodlight">
          <ClipboardList aria-hidden size={16} />
          Session plans
        </Link>
      </div>
    );
  }

  const { session, todays, group, groups } = view;
  const s = summarise(view);
  const all = group === ALL_GROUPS;
  const needsAWord = flagSummary(s.flagged);
  // On a day without a session the register shows the next one read-only: Mark here, Undo and scanning open on its day.
  const open = registerOpen(session.startsAt, now);
  const link = (q: { session?: string; group?: string }) =>
    `/coach?${new URLSearchParams({ session: q.session ?? session.id, ...(q.group ? { group: q.group } : {}) })}`;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-pitch-deep text-on-pitch">
      <header className="flex flex-col gap-3 px-4 pt-[max(env(safe-area-inset-top),20px)] pb-3.5">
        <div className="flex items-end justify-between gap-3 pt-4">
          <div className="flex flex-col gap-0.5">
            <Link href={back.href} className="mb-1 inline-flex min-h-12 items-center gap-1 self-start text-sm font-bold text-on-pitch-muted">
              <ChevronLeft aria-hidden size={18} />
              {back.label}
            </Link>
            <p className="text-label text-crest-gold uppercase">
              Gate check-in · {shortDay(session.startsAt)} {clock(session.startsAt)}
            </p>
            <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.02em]">{session.title} register</h1>
          </div>
          <span className="font-display text-[28px] leading-none text-floodlight">{time}</span>
        </div>
        {todays.length > 1 ? (
          <nav aria-label="Today's sessions" className="flex flex-wrap gap-2">
            {todays.map((t) => (
              <Link
                key={t.id}
                href={link({ session: t.id })}
                aria-current={t.id === session.id ? "page" : undefined}
                className={`inline-flex min-h-12 items-center rounded-pill px-4 text-sm font-extrabold ${t.id === session.id ? "bg-floodlight text-on-gold" : "bg-pitch text-on-pitch"}`}
              >
                {clock(t.startsAt)} {t.title}
              </Link>
            ))}
          </nav>
        ) : null}
        {groups.length > 1 ? (
          <nav aria-label="Age groups" className="flex flex-wrap gap-2">
            {[...groups, ALL_GROUPS].map((g) => (
              <Link
                key={g}
                href={link({ group: g })}
                aria-current={g === group ? "page" : undefined}
                className={`inline-flex min-h-12 min-w-14 items-center justify-center rounded-pill px-4 text-sm font-extrabold ${g === group ? "bg-floodlight text-on-gold" : "bg-pitch text-on-pitch"}`}
              >
                {g === ALL_GROUPS ? "All groups" : g}
              </Link>
            ))}
          </nav>
        ) : null}
        {open ? null : (
          <p className="flex items-center gap-3 rounded-app bg-pitch px-3.5 py-3 text-[15px] leading-[22px] text-on-pitch">
            <CalendarClock aria-hidden size={22} className="shrink-0 text-floodlight" />
            {registerClosedMessage(session.startsAt, now)}
          </p>
        )}
        <PassScanner disabled={!open} />
      </header>

      {s.latest.length > 0 ? (
        <section aria-label="Just checked in">
          {s.latest.map((r) => (
            <div key={r.id} className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-app bg-grass-tint py-2 pr-2 pl-3.5 text-ink">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-grass font-display text-[22px] text-on-grass">
                {r.shirtNumber ?? r.firstName[0]}
              </span>
              <span className="flex min-w-0 flex-1 flex-col items-start">
                <span className="text-[15px] font-bold">
                  {r.firstName} {r.lastInitial}. checked in
                </span>
                <span className="text-[13px] text-ink-muted">
                  {groupPlural(r.ageGroup)} · {clock(r.checkedInAt!)}
                </span>
              </span>
              <UndoCheckInButton sessionId={session.id} playerId={r.id} name={`${r.firstName} ${r.lastInitial}.`} disabled={!open} />
            </div>
          ))}
        </section>
      ) : null}

      <main className="mt-3.5 flex flex-1 flex-col gap-3 rounded-t-[24px] bg-cream px-4 pt-[18px] pb-[max(env(safe-area-inset-bottom),24px)] text-ink">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[30px] leading-none text-ink">{all ? "All groups" : groupPlural(group)}</h2>
          <p className="text-sm text-ink-muted">
            <span className="font-display text-[26px] text-ink tabular-nums">{s.here.length}</span> of {s.expectedTotal} expected
          </p>
        </div>
        <Progress value={s.here.length} max={Math.max(1, s.expectedTotal)} label={`${s.here.length} of ${s.expectedTotal} here`} className="w-full" />
        {view.rows.length === 0 ? (
          <p className="text-[15px] text-ink-muted">No players in the {groupPlural(group)} yet. Import families in the club admin.</p>
        ) : (
          <RegisterLists sessionId={session.id} open={open} showGroup={all} notHere={s.notHere.map(gate)} away={s.away.map(gate)} here={s.here.map(gate)}>
            {needsAWord ? (
              // One line for everyone already in who needs a word; the names (and their pills in Here) are a tap away.
              <details className="mt-2 rounded-app border-2 border-kit-orange bg-orange-tint px-3.5 text-ink">
                <summary className="flex min-h-12 cursor-pointer items-center py-2 text-[15px] font-bold">{needsAWord}</summary>
                <ul className="flex flex-col gap-2 pb-3">
                  {s.flagged.map((r) => (
                    <li key={r.id} className="flex flex-col items-start gap-1">
                      <span className="text-[15px] font-bold">
                        {r.firstName} {r.lastInitial}.{all ? ` · ${r.ageGroup}` : ""}
                      </span>
                      <FlagPills flags={r.flags} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </RegisterLists>
        )}
        {/* Not needed at the gate, so below the lists. */}
        <div className="mt-2 flex flex-wrap gap-x-5">
          <Link href="/coach/awards" className="inline-flex min-h-12 items-center gap-1.5 text-sm font-bold text-grass-text">
            <Star aria-hidden size={16} fill="currentColor" strokeWidth={0} />
            Points and stars
          </Link>
          <Link href="/coach/plans" className="inline-flex min-h-12 items-center gap-1.5 text-sm font-bold text-grass-text">
            <ClipboardList aria-hidden size={16} />
            Session plans
          </Link>
        </div>
      </main>
    </div>
  );
}
