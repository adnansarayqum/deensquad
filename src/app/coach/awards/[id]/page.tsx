import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Star } from "lucide-react";
import { AppHeader, Card } from "@/components/ui";
import { AwardForm, NoteForm } from "@/components/awards/AwardForm";
import { aiConfigured } from "@/lib/ai/claude";
import { removeAward } from "@/lib/awards/actions";
import { loadAwards } from "@/lib/awards/data";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Points and stars" };

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
    return player ? { player, ...(await loadAwards(tx, id, 10)) } : null;
  });
  if (!page) notFound();
  const { player, totals, recent } = page;
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
                    <button type="submit" className="min-h-11 px-2 text-sm font-bold text-ink-muted underline">
                      Undo
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        <Card className="p-4">
          <NoteForm playerId={player.id} firstName={player.first_name} ai={aiConfigured()} />
        </Card>
      </main>
    </div>
  );
}
