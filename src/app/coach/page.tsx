import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/admin/bits";
import { UndoCheckInButton } from "@/components/CheckInButton";
import { PassScanner } from "@/components/PassScanner";
import { RegisterAutoRefresh } from "@/components/RegisterAutoRefresh";
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

const tab = (active: boolean) =>
  `inline-flex min-h-12 min-w-14 items-center justify-center rounded-pill px-4 text-sm font-extrabold ${active ? "bg-floodlight text-on-gold" : "border-2 border-line bg-paper text-ink"}`;

export default async function CoachRegisterPage({ searchParams }: PageProps<"/coach">) {
  const user = await requireStaff();
  const params = await searchParams;
  const now = new Date();
  const view = await asUser(user.id, (tx) => loadRegister(tx, { now, sessionId: params.session, group: params.group, allowed: staffGroups(user.staff) }));
  const time = clock(now.toISOString());

  if (!view) {
    return (
      <>
        <PageHeader title="Register" subtitle="No sessions coming up for your groups." />
        <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px] text-ink-muted">
          Add the term&apos;s sessions under{" "}
          <Link href="/admin/sessions" className="font-bold text-grass-text underline">
            Sessions
          </Link>{" "}
          and the register fills in from them.
        </p>
      </>
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
    <>
      {open ? <RegisterAutoRefresh /> : null}
      {/* Scan sits beside the title and the clock on the session line, so the lists start higher on a phone at the gate. */}
      <PageHeader title="Register" actions={<PassScanner disabled={!open} className="" />}>
        <div className="-mt-1 flex items-center justify-between gap-3">
          <p className="text-[15px] leading-[22px] text-ink-muted">
            {session.title} · {shortDay(session.startsAt)} {clock(session.startsAt)}
          </p>
          {/* When the list was last loaded (it refreshes itself every 20 s), not a live clock. */}
          <span className="flex items-baseline gap-1.5 text-gold-text">
            <span className="text-[13px] font-bold">Updated</span>
            <span className="font-display text-[26px] leading-none tabular-nums">{time}</span>
          </span>
        </div>
        {todays.length > 1 ? (
          <nav aria-label="Today's sessions" className="flex flex-wrap gap-2">
            {todays.map((t) => (
              <Link key={t.id} href={link({ session: t.id })} aria-current={t.id === session.id ? "page" : undefined} className={tab(t.id === session.id)}>
                {clock(t.startsAt)} {t.title}
              </Link>
            ))}
          </nav>
        ) : null}
        {groups.length > 1 ? (
          <nav aria-label="Groups" className="flex flex-wrap gap-2">
            {[...groups, ALL_GROUPS].map((g) => (
              <Link key={g} href={link({ group: g })} aria-current={g === group ? "page" : undefined} className={tab(g === group)}>
                {g === ALL_GROUPS ? "All groups" : g}
              </Link>
            ))}
          </nav>
        ) : null}
        {open ? null : (
          <p className="flex items-center gap-3 rounded-app bg-grass-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
            <CalendarClock aria-hidden size={22} className="shrink-0 text-grass-text" />
            {registerClosedMessage(session.startsAt, now)}
          </p>
        )}
      </PageHeader>

      {s.latest.length > 0 ? (
        <section aria-label="Just checked in" className="flex flex-col gap-2">
          {s.latest.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-app bg-grass-tint py-2 pr-2 pl-3.5 text-ink">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-grass font-display text-[22px] text-on-grass">{r.shirtNumber ?? r.firstName[0]}</span>
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

      {/* A card at lg; on a phone the lists take the screen's width, so more of the register is on the first screen at the gate. */}
      <section aria-labelledby="register-group" className="flex flex-col gap-3 lg:rounded-app lg:border-2 lg:border-line lg:bg-paper lg:p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="register-group" className="font-display text-[28px] leading-none text-ink">
            {all ? "All groups" : groupPlural(group)}
          </h2>
          <p className="text-sm text-ink-muted">
            <span className="font-display text-[26px] text-ink tabular-nums">{s.here.length}</span> of {s.expectedTotal} expected
          </p>
        </div>
        <Progress value={s.here.length} max={Math.max(1, s.expectedTotal)} label={`${s.here.length} of ${s.expectedTotal} here`} className="w-full" />
        {view.rows.length === 0 ? (
          <p className="text-[15px] text-ink-muted">No players in the {groupPlural(group)} yet. A club admin adds families.</p>
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
      </section>
    </>
  );
}
