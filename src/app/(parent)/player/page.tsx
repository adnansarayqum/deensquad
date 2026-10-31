import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Clock, Flame, Lock, Star, Target, Trophy } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { BADGE_RULES, groupPlural, type Badge, type PaymentState } from "@/lib/domain";
import { getPlayerPage } from "@/lib/parent/load";
import { RememberChild } from "@/components/RememberChild";
import { StaffSwitch } from "@/components/StaffSwitch";
import { ProgressSummaryView } from "@/components/progress/ProgressSummary";
import { monthLabel } from "@/lib/progress/ratings";

export const metadata: Metadata = { title: "Family" };

const badgeIcons: Record<Badge["icon"], typeof Star> = { star: Star, clock: Clock, trophy: Trophy, flame: Flame, target: Target };

export default async function PlayerPage({ searchParams }: PageProps<"/player">) {
  const flags = await searchParams;
  const { family, child, stats, badges, note, awards, progress, records } = await getPlayerPage(flags.child);
  // Back from Add a child: the child it opened on was just added (only said for the child that's showing).
  const justAdded = child && flags.added === "1" && flags.child === child.id;

  return (
    <>
      {child ? <RememberChild id={child.id} /> : null}
      {child && stats ? (
        <header className="relative overflow-hidden rounded-b-[24px] bg-pitch-deep px-4 pt-[max(env(safe-area-inset-top),20px)] pb-5 text-on-pitch">
          <div aria-hidden className="stripes-v absolute inset-0 opacity-60" />
          <StaffSwitch on="pitch-deep" className="pt-4" />
          {family.children.length > 1 ? (
            <nav aria-label="Choose a child" className="relative flex flex-wrap gap-2 pt-4 pr-36 max-[374px]:pr-28">
              {family.children.map((c) => (
                <Link
                  key={c.id}
                  href={`/player?child=${c.id}`}
                  aria-current={c.id === child.id ? "page" : undefined}
                  className={`inline-flex min-h-12 items-center rounded-pill px-4 text-[15px] font-bold ${
                    c.id === child.id ? "bg-floodlight text-on-gold" : "bg-pitch text-on-pitch"
                  }`}
                >
                  {c.firstName}
                </Link>
              ))}
            </nav>
          ) : null}
          <div className="relative flex items-end gap-4 pt-6">
            {child.shirtNumber !== null ? (
              <span aria-hidden className="font-display text-[150px] leading-[0.78] text-floodlight">
                {child.shirtNumber}
              </span>
            ) : child.photoFileId ? (
              // The photo the parent added for the coaches; their own child, so it's theirs to see.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${child.photoFileId}`} alt="" width={64} height={64} className="mb-1.5 h-16 w-16 shrink-0 rounded-pill object-cover" />
            ) : null}
            <div className="flex flex-col gap-1.5 pb-1.5">
              <h1 className="font-display text-[44px] leading-[0.9] tracking-[0.02em]">
                {child.firstName} {child.lastName[0]}.
              </h1>
              <p className="text-[15px] text-on-pitch-muted">
                {child.shirtNumber ? <span className="sr-only">Shirt number {child.shirtNumber}. </span> : null}
                {[groupPlural(child.ageGroup), child.position, `since ${new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(child.joinedOn))}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {stats.streakWeeks >= 2 ? (
                <span className="inline-flex items-center gap-1.5 self-start rounded-pill bg-floodlight px-3 py-1 text-[13px] font-bold text-on-gold">
                  <Flame aria-hidden size={14} fill="currentColor" strokeWidth={0} />
                  {stats.streakWeeks}-week streak
                </span>
              ) : null}
            </div>
          </div>
        </header>
      ) : (
        <header className="rounded-b-[24px] bg-pitch-deep px-4 pt-[max(env(safe-area-inset-top),20px)] pb-5 text-on-pitch">
          <StaffSwitch on="pitch-deep" className="pt-4" />
          <h1 className="pt-6 font-display text-[44px] leading-[0.95]">Players</h1>
        </header>
      )}

      <main className="flex flex-col gap-3.5 px-4 pt-4 pb-4">
        {!child ? (
          <Card className="flex flex-col gap-2 p-4 text-[15px] leading-[22px]">
            <p>No players are linked to your email yet. Add your child here, or ask the club to add them.</p>
            <Link href="/player/add-child" className="btn-chunky btn-grass">
              Add a child
            </Link>
          </Card>
        ) : null}

        {justAdded ? (
          <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
            {child.firstName} is now on your account. The club has been told and will check their group.
          </p>
        ) : null}

        {child && stats ? (
          stats.attendancePct === null ? (
            <Card className="p-4 text-[15px] leading-[22px]">{child.firstName}&apos;s stats start after their first session.</Card>
          ) : (
            <dl className="grid grid-cols-2 gap-2.5">
              <Card className="flex flex-col-reverse items-center p-2.5">
                <dt className="text-[13px] font-bold text-ink-muted">{stats.sessions === 1 ? "session" : "sessions"}</dt>
                <dd className="font-display text-[40px] leading-none text-ink tabular-nums">{stats.sessions}</dd>
              </Card>
              <Card className="flex flex-col-reverse items-center p-2.5">
                <dt className="text-[13px] font-bold text-ink-muted">attendance</dt>
                <dd className="font-display text-[40px] leading-none text-ink tabular-nums">{stats.attendancePct}%</dd>
              </Card>
              <ScoreTile label={(awards?.totals.points ?? 0) === 1 ? "point" : "points"} value={awards?.totals.points ?? 0} />
              <ScoreTile label={(awards?.totals.stars ?? 0) === 1 ? "star" : "stars"} value={awards?.totals.stars ?? 0} />
            </dl>
          )
        ) : null}

        {/* The child's records first, before achievements (redesign brief, Oct 2026): each row says where it stands. */}
        {child && records ? (
          <section aria-labelledby="child-records" className="flex flex-col rounded-app border border-line bg-paper p-1">
            <h2 id="child-records" className="px-3 pt-3 pb-1 text-[18px] font-bold">
              {child.firstName}&apos;s details
            </h2>
            <DetailRow href={`/player/child/${child.id}`} title="Name, date of birth and photo" pill={child.photoFileId ? { tone: "done", text: "Photo added" } : { tone: "neutral", text: "Optional" }} />
            <DetailRow
              href={`/player/child/${child.id}/medical?from=/player`}
              title="Medical and additional needs"
              hint={records.medical ? undefined : "Please tell us about any allergies or medication."}
              pill={records.medical ? { tone: "done", text: "Added" } : { tone: "neutral", text: "Optional" }}
            />
            <DetailRow
              href={`/checklist/contacts?child=${child.id}&from=/player`}
              title="Emergency contacts"
              hint={records.contacts === 1 ? "Two is best." : undefined}
              pill={records.contacts ? { tone: "done", text: `${records.contacts} saved` } : { tone: "action", text: "Add one" }}
            />
            <DetailRow
              href={`/checklist/consent?child=${child.id}&from=/player`}
              title="Photo consent"
              pill={child.photoConsent === true ? { tone: "done", text: "Yes" } : child.photoConsent === false ? { tone: "neutral", text: "No" } : { tone: "action", text: "Not answered" }}
            />
            <DetailRow href="/checklist/payment?from=/player" title="Payment" pill={PAYMENT_PILL[records.payment]} />
          </section>
        ) : null}

        {child ? (
          <Link
            href={`/player/wellbeing?child=${child.id}`}
            className="flex min-h-12 items-center justify-between gap-3 rounded-app border border-line bg-paper px-4 py-3 text-[16px] font-bold"
          >
            <span className="flex flex-col">
              How&apos;s {child.firstName} finding football?
              <span className="text-[15px] font-normal text-ink-muted">A private check-in with the club</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
        ) : null}

        {child && awards && awards.recent.length > 0 ? (
          <Card className="flex flex-col gap-2 p-3.5">
            <h2 className="text-base font-bold">From the coaches</h2>
            <ul className="flex flex-col divide-y divide-line">
              {awards.recent.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-crest-gold text-on-gold">
                    {a.stars ? <Star aria-hidden size={20} fill="currentColor" strokeWidth={0} /> : <span className="font-display text-[20px]">+{a.points}</span>}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-bold">
                      {[a.stars ? "Star player" : null, a.points ? `${a.points} ${a.points === 1 ? "point" : "points"}` : null].filter(Boolean).join(" and ")}
                    </span>
                    <span className="text-[13px] text-ink-muted">
                      {[a.reason, a.from, new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }).format(new Date(a.givenAt))]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {child && badges.length > 0 ? (
          <Card className="flex flex-col gap-3 p-3.5">
            <h2 className="text-base font-bold">Badges</h2>
            <ul className="grid grid-cols-4 gap-2">
              {badges.map((b) => {
                const Icon = b.earnedOn ? badgeIcons[b.icon] : Lock;
                return (
                  <li key={b.id} className="flex flex-col items-center gap-2 text-center">
                    <span
                      className={`grid h-[58px] w-[58px] place-items-center rounded-pill ${
                        b.earnedOn ? "bg-crest-gold text-on-gold shadow-lip-gold" : "bg-line text-ink-muted shadow-[0_4px_0_#d3c5aa]"
                      }`}
                    >
                      <Icon aria-hidden size={26} />
                    </span>
                    <span className={`text-[13px] font-bold ${b.earnedOn ? "" : "text-ink-muted"}`}>{b.name}</span>
                    <span className="text-[13px] leading-[17px] text-ink-muted">
                      {b.earnedOn ? "Earned" : (BADGE_RULES[b.id] ?? "Given by the coaches.")}
                    </span>
                    {/* How close, where the app knows (sessions come from the register). Coaches still award it. */}
                    {!b.earnedOn && b.id === "ten-sessions" && stats ? (
                      <span className="flex w-full flex-col items-center gap-1">
                        <span className="text-[13px] font-bold text-gold-text tabular-nums">{Math.min(stats.sessions, 10)} of 10 so far</span>
                        <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-pill bg-line">
                          <span className="block h-full bg-crest-gold" style={{ width: `${Math.min(100, stats.sessions * 10)}%` }} />
                        </span>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {child && progress ? (
          // Only while an admin has switched progress on for parents; this child's own ratings and reports, nothing else.
          <Card className="flex flex-col gap-3 p-3.5">
            <h2 className="text-base font-bold">Progress</h2>
            <ProgressSummaryView firstName={child.firstName} progress={progress.summary} />
            {progress.latest ? (
              <section aria-labelledby="latest-report" className="flex flex-col gap-1.5 border-t border-line pt-3">
                <h3 id="latest-report" className="text-[15px] font-bold">
                  Progress report: {monthLabel(progress.latest.month)}
                </h3>
                {progress.latest.by ? <p className="text-[13px] text-ink-muted">From {progress.latest.by}</p> : null}
                <p className="text-[15px] leading-[22px] whitespace-pre-line">{progress.latest.body}</p>
                {progress.earlier ? (
                  <Link href={`/player/progress?child=${child.id}`} className="inline-flex min-h-12 items-center self-start text-[15px] font-bold text-grass-text underline">
                    Earlier reports
                  </Link>
                ) : null}
              </section>
            ) : null}
          </Card>
        ) : null}

        {note ? (
          <div className="flex items-start gap-3 rounded-app bg-grass-tint px-3.5 py-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-pitch text-[13px] font-bold text-on-pitch">
              {note.initials}
            </span>
            <p className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">Note from {note.from}</span>
              <span className="text-[15px] leading-5">{note.text}</span>
            </p>
          </div>
        ) : null}

        {/* Account things live in Settings, so Family stays about the children. */}
        <Link href="/player/settings" className="flex min-h-[52px] items-center justify-between gap-3 rounded-app border border-line bg-paper px-4 py-3 text-[16px] font-bold">
          <span className="flex flex-col">
            Settings
            <span className="text-[15px] font-normal text-ink-muted">Your details, parents and carers, notifications, your data, sign out</span>
          </span>
          <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
        </Link>
      </main>
    </>
  );
}

const PAYMENT_PILL: Record<PaymentState, { tone: "done" | "action" | "neutral" | "gold"; text: string }> = {
  active: { tone: "done", text: "Monthly plan" },
  self_reported: { tone: "gold", text: "Club checking" },
  pay_as_you_go: { tone: "neutral", text: "Pay as you go" },
  overdue: { tone: "action", text: "Overdue" },
  missing: { tone: "action", text: "Not set up" },
};

/** A row in the child's details: what it is, where it stands (a pill with a word), and a chevron. */
function DetailRow({ href, title, hint, pill }: { href: string; title: string; hint?: string; pill: { tone: "done" | "action" | "neutral" | "gold"; text: string } }) {
  return (
    <Link href={href} className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-2 last:border-b-0">
      <span className="flex min-w-0 flex-1 basis-40 flex-col">
        <span className="text-[16px] font-bold">{title}</span>
        {hint ? <span className="text-[15px] text-ink-muted">{hint}</span> : null}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Pill tone={pill.tone}>{pill.text}</Pill>
        <ChevronRight aria-hidden size={20} className="text-ink-muted" />
      </span>
    </Link>
  );
}

/** Points or stars: neutral at 0, so an empty tile doesn't read as a warning; gold once there's something. */
function ScoreTile({ label, value }: { label: string; value: number }) {
  return (
    <Card tone={value > 0 ? "gold" : undefined} className="flex flex-col-reverse items-center p-2.5">
      <dt className={`text-[13px] font-bold ${value > 0 ? "text-gold-text" : "text-ink-muted"}`}>{label}</dt>
      <dd className={`font-display text-[40px] leading-none tabular-nums ${value > 0 ? "text-gold-text" : "text-ink"}`}>{value}</dd>
    </Card>
  );
}
