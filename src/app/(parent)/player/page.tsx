import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Flame, LayoutDashboard, Lock, LogOut, ScanLine, Star, Target, Trophy } from "lucide-react";
import { Card } from "@/components/ui";
import type { Badge } from "@/lib/domain";
import { getFamily, getPlayerPage } from "@/lib/parent/load";
import { SignOutForm } from "@/components/SignOutForm";
import { StaffSwitch } from "@/components/StaffSwitch";

export const metadata: Metadata = { title: "Player" };

const badgeIcons: Record<Badge["icon"], typeof Star> = { star: Star, clock: Clock, trophy: Trophy, flame: Flame, target: Target };

export default async function PlayerPage({ searchParams }: PageProps<"/player">) {
  const [{ family, child, stats, badges, note, awards }, { user }] = await Promise.all([getPlayerPage((await searchParams).child), getFamily()]);

  return (
    <>
      {child && stats ? (
        <header className="relative overflow-hidden rounded-b-[24px] bg-pitch-deep px-4 pt-[max(env(safe-area-inset-top),20px)] pb-5 text-on-pitch">
          <div aria-hidden className="stripes-v absolute inset-0 opacity-60" />
          <StaffSwitch on="pitch-deep" className="pt-4" />
          {family.children.length > 1 ? (
            <nav aria-label="Choose a child" className="relative flex flex-wrap gap-2 pt-4">
              {family.children.map((c) => (
                <Link
                  key={c.id}
                  href={`/player?child=${c.id}`}
                  aria-current={c.id === child.id ? "page" : undefined}
                  className={`inline-flex min-h-12 items-center rounded-pill px-4 text-sm font-extrabold ${
                    c.id === child.id ? "bg-floodlight text-on-gold" : "bg-pitch text-on-pitch"
                  }`}
                >
                  {c.firstName}
                </Link>
              ))}
            </nav>
          ) : null}
          <div className="relative flex items-end gap-4 pt-6">
            <span aria-hidden className="font-display text-[150px] leading-[0.78] text-floodlight">
              {child.shirtNumber ?? child.firstName[0]}
            </span>
            <div className="flex flex-col gap-1.5 pb-1.5">
              <h1 className="font-display text-[44px] leading-[0.9] tracking-[0.02em]">
                {child.firstName} {child.lastName[0]}.
              </h1>
              <p className="text-sm text-on-pitch-muted">
                {child.shirtNumber ? <span className="sr-only">Shirt number {child.shirtNumber}. </span> : null}
                {[`${child.ageGroup}s`, child.position, `since ${new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(child.joinedOn))}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {stats.streakWeeks > 0 ? (
                <span className="inline-flex items-center gap-1.5 self-start rounded-pill bg-floodlight px-3 py-1 text-[13px] font-extrabold text-on-gold">
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
        {!child ? <Card className="p-4 text-[15px] leading-[22px]">No players are linked to your email yet. Ask the club to add your child.</Card> : null}

        {child && stats ? (
          stats.attendancePct === null ? (
            <Card className="p-4 text-[15px] leading-[22px]">{child.firstName}&apos;s stats start after their first session.</Card>
          ) : (
            <dl className="grid grid-cols-2 gap-2.5">
              <Card className="flex flex-col-reverse items-center p-2.5">
                <dt className="text-xs font-bold text-ink-muted">sessions</dt>
                <dd className="font-display text-[40px] leading-none text-ink tabular-nums">{stats.sessions}</dd>
              </Card>
              <Card className="flex flex-col-reverse items-center p-2.5">
                <dt className="text-xs font-bold text-ink-muted">attendance</dt>
                <dd className="font-display text-[40px] leading-none text-ink tabular-nums">{stats.attendancePct}%</dd>
              </Card>
              <Card tone="gold" className="flex flex-col-reverse items-center p-2.5">
                <dt className="text-xs font-bold text-gold-text">points</dt>
                <dd className="font-display text-[40px] leading-none text-gold-text tabular-nums">{awards?.totals.points ?? 0}</dd>
              </Card>
              <Card tone="gold" className="flex flex-col-reverse items-center p-2.5">
                <dt className="text-xs font-bold text-gold-text">{awards?.totals.stars === 1 ? "star" : "stars"}</dt>
                <dd className="font-display text-[40px] leading-none text-gold-text tabular-nums">{awards?.totals.stars ?? 0}</dd>
              </Card>
            </dl>
          )
        ) : null}

        {child && awards && awards.recent.length > 0 ? (
          <Card className="flex flex-col gap-2 p-3.5">
            <h2 className="text-base font-extrabold">From the coaches</h2>
            <ul className="flex flex-col divide-y-2 divide-line">
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
            <h2 className="text-base font-extrabold">Badges</h2>
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
                    <span className={`text-xs font-bold ${b.earnedOn ? "" : "text-ink-muted"}`}>
                      {b.name}
                      {b.earnedOn ? "" : <span className="sr-only"> (not earned yet)</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {note ? (
          <div className="flex items-start gap-3 rounded-app bg-grass-tint px-3.5 py-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-pitch text-[13px] font-extrabold text-on-pitch">
              {note.initials}
            </span>
            <p className="flex flex-col gap-0.5">
              <span className="text-sm font-extrabold">Note from {note.from}</span>
              <span className="text-sm leading-5">{note.text}</span>
            </p>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
          {user.staff ? (
            <div className="flex gap-4">
              <Link href="/coach" className="inline-flex min-h-12 items-center gap-1.5 font-bold text-grass-text">
                <ScanLine aria-hidden size={18} />
                Register
              </Link>
              <Link href="/admin" className="inline-flex min-h-12 items-center gap-1.5 font-bold text-grass-text">
                <LayoutDashboard aria-hidden size={18} />
                Club admin
              </Link>
            </div>
          ) : (
            <span className="text-ink-muted">Signed in as {user.email}</span>
          )}
          <a href="/privacy" className="inline-flex min-h-12 items-center font-bold text-ink-muted underline">
            Privacy
          </a>
          <SignOutForm>
            <button type="submit" className="inline-flex min-h-12 items-center gap-1.5 font-bold text-ink-muted">
              <LogOut aria-hidden size={16} />
              Sign out
            </button>
          </SignOutForm>
        </div>
      </main>
    </>
  );
}
