import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Flame, Lock, RotateCcw, ScanLine, Star, Target, Trophy } from "lucide-react";
import { Card, Progress } from "@/components/ui";
import { resetDemo } from "@/lib/actions";
import { getParentView } from "@/lib/data";
import type { Badge } from "@/lib/domain";

export const metadata: Metadata = { title: "Player" };

const badgeIcons: Record<Badge["icon"], typeof Star> = { star: Star, clock: Clock, trophy: Trophy, flame: Flame, target: Target };

export default async function PlayerPage() {
  const view = await getParentView();
  const p = view.player;
  const joined = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(p.joinedOn));

  return (
    <>
      <header className="relative overflow-hidden rounded-b-[24px] bg-pitch-deep px-4 pt-[max(env(safe-area-inset-top),20px)] pb-5 text-on-pitch">
        <div aria-hidden className="stripes-v absolute inset-0 opacity-60" />
        <div className="relative flex items-end gap-4 pt-6">
          <span aria-hidden className="font-display text-[150px] leading-[0.78] text-floodlight">
            {p.shirtNumber}
          </span>
          <div className="flex flex-col gap-1.5 pb-1.5">
            <h1 className="font-display text-[44px] leading-[0.9] tracking-[0.02em]">
              {p.firstName} {p.lastInitial}.
            </h1>
            <p className="text-sm text-on-pitch-muted">
              <span className="sr-only">Shirt number {p.shirtNumber}. </span>
              {p.ageGroup}s · {p.position} · since {joined}
            </p>
            <span className="inline-flex items-center gap-1.5 self-start rounded-pill bg-floodlight px-3 py-1 text-[13px] font-extrabold text-on-gold">
              <Flame aria-hidden size={14} fill="currentColor" strokeWidth={0} />
              {view.stats.streakWeeks}-week streak
            </span>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-3.5 px-4 pt-4 pb-4">
        <dl className="grid grid-cols-3 gap-2.5">
          <Card className="flex flex-col-reverse items-center p-2.5">
            <dt className="text-xs font-bold text-ink-muted">sessions</dt>
            <dd className="font-display text-[40px] leading-none text-ink tabular-nums">{view.stats.sessions}</dd>
          </Card>
          <Card className="flex flex-col-reverse items-center p-2.5">
            <dt className="text-xs font-bold text-ink-muted">attendance</dt>
            <dd className="font-display text-[40px] leading-none text-ink tabular-nums">{view.stats.attendancePct}%</dd>
          </Card>
          <Card tone="gold" className="flex flex-col-reverse items-center p-2.5">
            <dt className="text-xs font-bold text-gold-text">badges</dt>
            <dd className="font-display text-[40px] leading-none text-gold-text tabular-nums">{view.stats.badges}</dd>
          </Card>
        </dl>

        <Card className="flex flex-col gap-3 p-3.5">
          <h2 className="text-base font-extrabold">Badges</h2>
          <ul className="grid grid-cols-4 gap-2">
            {view.badges.map((b) => {
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

        <Card className="flex flex-col gap-2.5 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">This week&apos;s challenge</h2>
            <span className="rounded-pill bg-gold-tint px-2.5 py-0.5 text-label text-gold-text uppercase">{view.challenge.name}</span>
          </div>
          <p className="text-[15px] leading-[22px]">{view.challenge.description}</p>
          <div className="flex items-center gap-2.5">
            <Progress value={view.challenge.progress} max={view.challenge.target} label={`${view.challenge.name} progress`} />
            <span className="font-display text-2xl leading-none text-ink tabular-nums">
              {view.challenge.progress} / {view.challenge.target}
            </span>
          </div>
        </Card>

        <div className="flex items-start gap-3 rounded-app bg-grass-tint px-3.5 py-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-pitch text-[13px] font-extrabold text-on-pitch">
            {view.coachNote.initials}
          </span>
          <p className="flex flex-col gap-0.5">
            <span className="text-sm font-extrabold">Coach&apos;s note</span>
            <span className="text-sm leading-5">{view.coachNote.text}</span>
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
          <Link href="/coach" className="inline-flex items-center gap-1.5 font-bold text-grass-text">
            <ScanLine aria-hidden size={18} />
            Coach view
          </Link>
          <form action={resetDemo}>
            <button type="submit" className="inline-flex items-center gap-1.5 font-bold text-ink-muted">
              <RotateCcw aria-hidden size={16} />
              Reset demo
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
