import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { badgeIcon } from "@/components/badgeIcons";
import { PageHeader, Section } from "@/components/admin/bits";
import { Card } from "@/components/ui";
import { AwardForm, NoteForm } from "@/components/awards/AwardForm";
import type { AgeGroup } from "@/lib/domain";
import { SpotlightForm } from "@/components/awards/SpotlightForm";
import { removePlayerOfTheWeek } from "@/lib/spotlight/actions";
import { COMMENT_MAX, loadWeekSpotlight, weekStart, weekWords } from "@/lib/spotlight/data";
import { aiConfigured } from "@/lib/ai/claude";
import { removeAward, setBadge } from "@/lib/awards/actions";
import { loadAwards } from "@/lib/awards/data";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { REWARD_POINTS, groupPlural, hasAwards } from "@/lib/domain";
import { londonIsoDate } from "@/lib/dates";
import { ProgressReportForm } from "@/components/progress/ProgressReportForm";
import { ProgressSummaryView } from "@/components/progress/ProgressSummary";
import { loadProgress, loadReport } from "@/lib/progress/data";
import { monthOnly, pickMonth, reportMonths } from "@/lib/progress/ratings";
import { progressForParents } from "@/lib/settings";
import Link from "next/link";

export const metadata: Metadata = { title: "Points and stars" };

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
    // Coaches see the badges they give; admins also the register's (10 sessions, On time ×5). A retired badge only
    // where the child has it.
    const badges = await tx.query<{ id: string; name: string; icon: string; earned_on: string | null; given_by: string }>(
      `select b.id, b.name, b.icon, pb.earned_on::text as earned_on, b.given_by from badges b
       left join player_badges pb on pb.badge_id = b.id and pb.player_id = $1
       where (not b.retired or pb.player_id is not null) and (b.given_by = 'coach' or $2)
       order by b.sort, b.name`,
      [id, user.staff.role === "admin"],
    );
    if (!player) return null;
    const [awards, progress, report, shown] = await Promise.all([loadAwards(tx, id, 10), loadProgress(tx, id, today), loadReport(tx, id, month), progressForParents(tx)]);
    // This week's Player of the week for the child's group (whoever holds it), for the card below.
    const week = weekStart(new Date());
    const spotlight = await loadWeekSpotlight(tx, player.age_group as AgeGroup, week);
    return { player, badges, ...awards, progress, report, shown, spotlight, week };
  });
  if (!page) notFound();
  const { player, totals, recent, badges, progress, report, shown, spotlight, week } = page;
  const holdsIt = spotlight?.playerId === player.id;
  const isAdmin = user.staff.role === "admin";
  // U15 has no points, stars or badges (the owner's decision); progress, reports and notes stay.
  const awarded = hasAwards(player.age_group);

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: `/coach/awards?group=${player.age_group}`, label: "Points and stars" }}
        title={`${player.first_name} ${player.last_name}`}
        subtitle={
          awarded
            ? `${groupPlural(player.age_group)} · ${totals.points} ${totals.points === 1 ? "point" : "points"} · ${totals.stars} ${totals.stars === 1 ? "star" : "stars"}${totals.points >= REWARD_POINTS ? " · reward earned" : ""}`
            : groupPlural(player.age_group)
        }
      />
      {/* Player of the week: one child per group each week; their parents get a card to keep and share. */}
      <Section title="Player of the week" aside={<span className="text-meta text-ink-muted">{groupPlural(player.age_group)}, {weekWords(week)}</span>}>
        {holdsIt ? (
          <p className="mb-3 text-small">
            {player.first_name} is this week&apos;s Player of the week.{" "}
            <a href={`/api/spotlight/${spotlight!.id}/card`} className="font-bold text-grass-text underline">
              See the card
            </a>
          </p>
        ) : spotlight ? (
          <p className="mb-3 text-small text-ink-muted">
            This week it&apos;s {spotlight.firstName} {spotlight.lastName}. Saving here gives it to {player.first_name} instead.
          </p>
        ) : null}
        <SpotlightForm playerId={player.id} firstName={player.first_name} group={player.age_group} comment={holdsIt ? spotlight!.comment : undefined} max={COMMENT_MAX} />
        {holdsIt ? (
          <form action={removePlayerOfTheWeek} className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <input type="hidden" name="spotlight" value={spotlight!.id} />
            <label className="flex min-h-12 items-center gap-3 text-small">
              <input type="checkbox" name="confirm" value="yes" required className="check" />
              Yes, take it back
            </label>
            <button type="submit" className="btn-chunky btn-paper btn-small" aria-label={`Take Player of the week back from ${player.first_name}`}>
              Take it back
            </button>
          </form>
        ) : null}
      </Section>
      {awarded ? (
        <Card className="p-4">
          <AwardForm playerId={player.id} firstName={player.first_name} />
        </Card>
      ) : (
        <p className="text-small text-ink-muted">The {groupPlural(player.age_group)} don&apos;t have points, stars or badges. Rate them and write notes and reports here.</p>
      )}

      {awarded && recent.length > 0 ? (
        <Section title="Given so far">
          <ul className="flex flex-col gap-2">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-dash border border-line bg-cream px-3.5 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-small font-bold">
                    {a.stars ? <Star aria-hidden size={16} className="text-gold-text" fill="currentColor" strokeWidth={0} /> : null}
                    {[a.stars ? "Star player" : null, a.points ? `${a.points} ${a.points === 1 ? "point" : "points"}` : null].filter(Boolean).join(" and ")}
                  </span>
                  <span className="text-meta text-ink-muted">
                    {[a.reason, a.from, day.format(new Date(a.givenAt))].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {isAdmin || a.fromId === user.staff.id ? (
                  <form action={removeAward}>
                    <input type="hidden" name="award" value={a.id} />
                    <button
                      type="submit"
                      className="min-h-12 px-2 text-small font-bold text-ink-muted underline"
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

      {awarded && badges.length > 0 ? (
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-subhead font-bold">Badges</h2>
            <ul className="flex flex-col gap-2">
              {badges.map((b) => {
                const Icon = badgeIcon(b.icon);
                return (
                  <li key={b.id} className="flex items-center gap-3">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-pill ${b.earned_on ? "bg-crest-gold text-on-gold" : "bg-line text-ink-muted"}`}
                    >
                      <Icon aria-hidden size={20} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-small font-bold">{b.name}</span>
                      <span className="text-meta text-ink-muted">
                        {b.earned_on ? `Awarded ${day.format(new Date(b.earned_on))}` : b.given_by === "admin" ? "Not yet · from the register" : "Not yet"}
                      </span>
                    </span>
                    <form action={setBadge}>
                      <input type="hidden" name="player" value={player.id} />
                      <input type="hidden" name="badge" value={b.id} />
                      <input type="hidden" name="give" value={b.earned_on ? "no" : "yes"} />
                      {b.earned_on ? (
                        <button type="submit" className="min-h-12 px-2 text-small font-bold text-ink-muted underline" aria-label={`Take back ${b.name}`}>
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
          <Link href="/coach/ratings" className="inline-flex min-h-12 items-center text-small font-bold text-grass-text underline">
            Rate players
          </Link>
        }
      >
        {progress.current ? (
          <ProgressSummaryView firstName={player.first_name} progress={progress} by />
        ) : (
          <p className="text-small text-ink-muted">{player.first_name} hasn&apos;t been rated in the last 3 months.</p>
        )}
      </Section>

      <Section title="Progress report" aside={<span className="text-meta text-ink-muted">{shown ? "Parents see published reports" : "Parents don't see reports yet"}</span>}>
        <nav aria-label="Report month" className="flex flex-wrap gap-2">
          {months.map((m) => (
            <Link
              key={m}
              href={`/coach/awards/${player.id}?month=${m.slice(0, 7)}`}
              aria-current={m === month ? "page" : undefined}
              className={`inline-flex min-h-12 items-center justify-center rounded-pill px-4 text-small font-bold ${m === month ? "bg-floodlight text-on-gold" : "border border-line bg-paper text-ink"}`}
            >
              {monthOnly(m)}
            </Link>
          ))}
        </nav>
        <p className="text-small text-ink-muted">
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
