import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Flame, Star, Target, Trophy } from "lucide-react";
import { PageHeader, Section } from "@/components/admin/bits";
import { Card } from "@/components/ui";
import { AwardForm, NoteForm } from "@/components/awards/AwardForm";
import { aiConfigured } from "@/lib/ai/claude";
import { removeAward, setBadge } from "@/lib/awards/actions";
import { loadAwards } from "@/lib/awards/data";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { groupPlural } from "@/lib/domain";
import { londonIsoDate } from "@/lib/dates";
import { ProgressReportForm } from "@/components/progress/ProgressReportForm";
import { ProgressSummaryView } from "@/components/progress/ProgressSummary";
import { loadProgress, loadReport } from "@/lib/progress/data";
import { monthOnly, pickMonth, reportMonths } from "@/lib/progress/ratings";
import { progressForParents } from "@/lib/settings";
import Link from "next/link";

export const metadata: Metadata = { title: "Points and stars" };

const badgeIcons: Record<string, typeof Star> = { star: Star, clock: Clock, trophy: Trophy, flame: Flame, target: Target };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function PlayerAwardsPage({ params, searchParams }: PageProps<"/coach/awards/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const today = londonIsoDate(new Date());
  const months = reportMonths(today);
  const month = pickMonth((await searchParams).month, months);
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
    if (!player) return null;
    const [awards, progress, report, shown] = await Promise.all([loadAwards(tx, id, 10), loadProgress(tx, id, today), loadReport(tx, id, month), progressForParents(tx)]);
    return { player, badges, ...awards, progress, report, shown };
  });
  if (!page) notFound();
  const { player, totals, recent, badges, progress, report, shown } = page;
  const isAdmin = user.staff.role === "admin";

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: `/coach/awards?group=${player.age_group}`, label: "Points and stars" }}
        title={`${player.first_name} ${player.last_name}`}
        subtitle={`${groupPlural(player.age_group)} · ${totals.points} ${totals.points === 1 ? "point" : "points"} · ${totals.stars} ${totals.stars === 1 ? "star" : "stars"}`}
      />
      <Card className="p-4">
        <AwardForm playerId={player.id} firstName={player.first_name} />
      </Card>

      {recent.length > 0 ? (
        <Section title="Given so far">
          <ul className="flex flex-col gap-2">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-dash border-2 border-line bg-cream px-3.5 py-2.5">
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
                      className="min-h-12 px-2 text-sm font-bold text-ink-muted underline"
                      aria-label={`Undo ${[a.stars ? "star" : null, a.points ? `${a.points} ${a.points === 1 ? "point" : "points"}` : null].filter(Boolean).join(" and ")}, ${day.format(new Date(a.givenAt))}`}
                    >
                      Undo
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
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
                        <button type="submit" className="min-h-12 px-2 text-sm font-bold text-ink-muted underline" aria-label={`Take back ${b.name}`}>
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

      <Section
        title="Progress"
        aside={
          <Link href="/coach/ratings" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
            Rate players
          </Link>
        }
      >
        {progress.current ? (
          <ProgressSummaryView firstName={player.first_name} progress={progress} by />
        ) : (
          <p className="text-[15px] text-ink-muted">{player.first_name} hasn&apos;t been rated in the last 3 months.</p>
        )}
      </Section>

      <Section title="Progress report" aside={<span className="text-[13px] text-ink-muted">{shown ? "Parents see published reports" : "Parents don't see reports yet"}</span>}>
        <nav aria-label="Report month" className="flex flex-wrap gap-2">
          {months.map((m) => (
            <Link
              key={m}
              href={`/coach/awards/${player.id}?month=${m.slice(0, 7)}`}
              aria-current={m === month ? "page" : undefined}
              className={`inline-flex min-h-12 items-center justify-center rounded-pill px-4 text-sm font-extrabold ${m === month ? "bg-floodlight text-on-gold" : "border-2 border-line bg-paper text-ink"}`}
            >
              {monthOnly(m)}
            </Link>
          ))}
        </nav>
        <p className="text-[14px] text-ink-muted">
          {report
            ? report.publishedAt
              ? `Published ${day.format(new Date(report.publishedAt))}${report.by ? ` · last saved by ${report.by}` : ""}`
              : `Draft${report.by ? ` · last saved by ${report.by}` : ""}`
            : "Not written yet"}
        </p>
        <ProgressReportForm
          key={month}
          playerId={player.id}
          firstName={player.first_name}
          month={month}
          monthName={monthOnly(month)}
          body={report?.body ?? ""}
          published={Boolean(report?.publishedAt)}
          ai={aiConfigured()}
        />
      </Section>

      <Card className="p-4">
        <NoteForm playerId={player.id} firstName={player.first_name} ai={aiConfigured()} />
      </Card>
    </div>
  );
}
