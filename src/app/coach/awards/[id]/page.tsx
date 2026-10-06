import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Flame, Star, Target, Trophy } from "lucide-react";
import { AppHeader, Card } from "@/components/ui";
import { AwardForm, NoteForm } from "@/components/awards/AwardForm";
import { aiConfigured } from "@/lib/ai/claude";
import { removeAward, setBadge } from "@/lib/awards/actions";
import { loadAwards } from "@/lib/awards/data";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Points and stars" };

const badgeIcons: Record<string, typeof Star> = { star: Star, clock: Clock, trophy: Trophy, flame: Flame, target: Target };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function PlayerAwardsPage({ params }: PageProps<"/coach/awards/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const page = await asUser(user.id, async (tx) => {
    const [player] = await tx.query<{ id: string; first_name: string; last_name: string; age_group: string }>(
      `select id, first_name, last_name, age_group::text as age_group from players where id = $1 and age_group::text = any ($2::text[])`,
      [id, staffGroups(user.staff)],
    );
    const badges = await tx.query<{ id: string; name: string; icon: string; earned_on: string | null }>(
      `select b.id, b.name, b.icon, pb.earned_on::text as earned_on from badges b
       left join player_badges pb on pb.badge_id = b.id and pb.player_id = $1 order by b.name`,
      [id],
    );
    return player ? { player, badges, ...(await loadAwards(tx, id, 10)) } : null;
  });
  if (!page) notFound();
  const { player, totals, recent, badges } = page;
  const isAdmin = user.staff.role === "admin";

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream pb-[max(env(safe-area-inset-bottom),24px)]">
      <AppHeader>
        <Link href={`/coach/awards?group=${player.age_group}`} className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-on-pitch-muted">
          <ChevronLeft aria-hidden size={18} />
          {player.age_group}s
        </Link>
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">
          {player.first_name} {player.last_name}
        </h1>
        <p className="text-sm text-on-pitch-muted">
          {totals.points} {totals.points === 1 ? "point" : "points"} · {totals.stars} {totals.stars === 1 ? "star" : "stars"}
        </p>
      </AppHeader>
      <main className="flex flex-col gap-4 px-4 pt-4">
        <Card className="p-4">
          <AwardForm playerId={player.id} firstName={player.first_name} />
        </Card>

        {recent.length > 0 ? (
          <section aria-labelledby="given" className="flex flex-col gap-2">
            <h2 id="given" className="text-label text-ink-muted uppercase">
              Given so far
            </h2>
            {recent.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-[15px] font-bold">
                    {a.stars ? <Star aria-hidden size={15} className="text-gold-text" fill="currentColor" strokeWidth={0} /> : null}
                    {[a.stars ? "Star player" : null, a.points ? `${a.points} ${a.points === 1 ? "point" : "points"}` : null].filter(Boolean).join(" and ")}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {[a.reason, a.from, day.format(new Date(a.givenAt))].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {isAdmin || a.fromId === user.staff.id ? (
                  <form action={removeAward}>
                    <input type="hidden" name="award" value={a.id} />
                    <button
                      type="submit"
                      className="min-h-11 px-2 text-sm font-bold text-ink-muted underline"
                      aria-label={`Undo ${[a.stars ? "star" : null, a.points ? `${a.points} ${a.points === 1 ? "point" : "points"}` : null].filter(Boolean).join(" and ")}, ${day.format(new Date(a.givenAt))}`}
                    >
                      Undo
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {badges.length > 0 ? (
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-[17px] font-extrabold">Badges</h2>
            <ul className="flex flex-col gap-2">
              {badges.map((b) => {
                const Icon = badgeIcons[b.icon] ?? Star;
                return (
                  <li key={b.id} className="flex items-center gap-3">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-pill ${b.earned_on ? "bg-crest-gold text-on-gold" : "bg-line text-ink-muted"}`}
                    >
                      <Icon aria-hidden size={20} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-bold">{b.name}</span>
                      <span className="text-[13px] text-ink-muted">{b.earned_on ? `Awarded ${day.format(new Date(b.earned_on))}` : "Not yet"}</span>
                    </span>
                    <form action={setBadge}>
                      <input type="hidden" name="player" value={player.id} />
                      <input type="hidden" name="badge" value={b.id} />
                      <input type="hidden" name="give" value={b.earned_on ? "no" : "yes"} />
                      {b.earned_on ? (
                        <button type="submit" className="min-h-11 px-2 text-sm font-bold text-ink-muted underline" aria-label={`Take back ${b.name}`}>
                          Take back
                        </button>
                      ) : (
                        <button type="submit" className="btn-chunky btn-paper btn-small" aria-label={`Award ${b.name}`}>
                          Award
                        </button>
                      )}
                    </form>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        <Card className="p-4">
          <NoteForm playerId={player.id} firstName={player.first_name} ai={aiConfigured()} />
        </Card>
      </main>
    </div>
  );
}
