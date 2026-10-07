import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { AppHeader, Card } from "@/components/ui";
import { loadSquadAwards } from "@/lib/awards/data";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { groupPlural, isAgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Points and stars" };

export default async function AwardsPage({ searchParams }: PageProps<"/coach/awards">) {
  const user = await requireStaff();
  const groups = staffGroups(user.staff);
  const asked = (await searchParams).group;
  const group = isAgeGroup(asked) && groups.includes(asked) ? asked : groups[0];
  const squad = await asUser(user.id, (tx) => loadSquadAwards(tx, group));

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream pb-[max(env(safe-area-inset-bottom),24px)]">
      <AppHeader>
        <Link href="/coach" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-on-pitch-muted">
          <ChevronLeft aria-hidden size={18} />
          Register
        </Link>
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">Points and stars</h1>
        <p className="text-sm text-on-pitch-muted">Tap a player to give points, a star or a note for their parents.</p>
        {groups.length > 1 ? (
          <nav aria-label="Groups" className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Link
                key={g}
                href={`/coach/awards?group=${g}`}
                aria-current={g === group ? "page" : undefined}
                className={`inline-flex min-h-11 min-w-14 items-center justify-center rounded-pill px-4 text-sm font-extrabold ${g === group ? "bg-floodlight text-on-gold" : "bg-pitch-deep text-on-pitch"}`}
              >
                {g}
              </Link>
            ))}
          </nav>
        ) : null}
      </AppHeader>
      <main className="flex flex-col gap-2 px-4 pt-4">
        {squad.length === 0 ? <Card className="p-4 text-[15px]">No players in the {groupPlural(group)} yet.</Card> : null}
        {squad.map((p) => (
          <Link
            key={p.id}
            href={`/coach/awards/${p.id}`}
            className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-2.5 shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-pitch font-display text-[22px] text-on-pitch">
              {p.shirtNumber ?? p.firstName[0]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">
                {p.firstName} {p.lastName}
              </span>
              <span className="text-[13px] text-ink-muted">
                {p.points} {p.points === 1 ? "point" : "points"}
              </span>
            </span>
            {p.stars > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-gold-tint px-2.5 py-1 text-sm font-extrabold text-gold-text">
                <Star aria-hidden size={14} fill="currentColor" strokeWidth={0} />
                {p.stars}
                <span className="sr-only"> {p.stars === 1 ? "star" : "stars"}</span>
              </span>
            ) : null}
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
        ))}
      </main>
    </div>
  );
}
