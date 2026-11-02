import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/admin/bits";
import { badgeIcon } from "@/components/badgeIcons";
import { setBadge, setRewardGiven } from "@/lib/awards/actions";
import { loadRewards, type BadgeCandidate, type RewardRow } from "@/lib/awards/milestones";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { REWARD_POINTS } from "@/lib/domain";

export const metadata: Metadata = { title: "Rewards" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

// The owner's side of points and badges (his voice note, 2 Nov 2026): who has reached 20 points and is waiting for
// their reward, and the badges the register earns (10 sessions, On time ×5), which only admins give.
export default async function RewardsPage() {
  const user = await requireAdmin();
  const rewards = await asUser(user.id, (tx) => loadRewards(tx));

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader title="Rewards" back={{ href: "/coach/awards", label: "Points and stars" }} subtitle={`Children who reached ${REWARD_POINTS} points, and the badges the register earns.`} />

      <Section title={`Reached ${REWARD_POINTS} points (${rewards.toReward.length})`} id="to-reward">
        {rewards.toReward.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Nobody is waiting for a reward. You and the parents are told when a child reaches {REWARD_POINTS} points.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rewards.toReward.map((r) => (
              <RewardItem key={r.playerId} row={r} />
            ))}
          </ul>
        )}
      </Section>

      {rewards.badges.map((b) => {
        const Icon = badgeIcon(b.icon);
        return (
          <Section key={b.id} title={`${b.name} (${b.candidates.length})`} id={b.id}>
            <p className="flex items-center gap-2 text-[14px] text-ink-muted">
              <Icon aria-hidden size={16} className="shrink-0" />
              {b.rule} Only admins give this badge.
            </p>
            {b.candidates.length === 0 ? (
              <p className="text-[15px] text-ink-muted">Nobody new has earned it.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {b.candidates.map((c) => (
                  <BadgeItem key={c.playerId} badge={b} candidate={c} />
                ))}
              </ul>
            )}
          </Section>
        );
      })}

      {rewards.rewarded.length > 0 ? (
        <Section title="Rewards given">
          <ul className="flex flex-col gap-2">
            {rewards.rewarded.map((r) => (
              <li key={r.playerId} className="flex items-center gap-3 rounded-dash border border-line bg-cream px-3.5 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/coach/awards/${r.playerId}`} className="text-[15px] font-bold underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                  <span className="text-[13px] text-ink-muted">
                    {[r.group, `given ${day.format(new Date(r.rewardedAt!))}`, r.rewardedBy ? `by ${r.rewardedBy}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <form action={setRewardGiven}>
                  <input type="hidden" name="player" value={r.playerId} />
                  <input type="hidden" name="given" value="no" />
                  <button type="submit" className="min-h-12 px-2 text-sm font-bold text-ink-muted underline" aria-label={`Undo reward given: ${r.name}`}>
                    Undo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function RewardItem({ row }: { row: RewardRow }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-dash border border-line bg-cream px-3.5 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <Link href={`/coach/awards/${row.playerId}`} className="text-[15px] font-bold underline-offset-2 hover:underline">
          {row.name}
        </Link>
        <span className="text-[13px] text-ink-muted">
          {row.group} · {row.points} points · reached {day.format(new Date(row.reachedAt))}
        </span>
      </span>
      <form action={setRewardGiven}>
        <input type="hidden" name="player" value={row.playerId} />
        <input type="hidden" name="given" value="yes" />
        <button type="submit" className="btn-chunky btn-grass btn-small" aria-label={`Reward given: ${row.name}`}>
          Reward given
        </button>
      </form>
    </li>
  );
}

function BadgeItem({ badge, candidate }: { badge: { id: string; name: string }; candidate: BadgeCandidate }) {
  const unit = badge.id === "on-time-5" ? "on time" : candidate.count === 1 ? "session" : "sessions";
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-dash border border-line bg-cream px-3.5 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <Link href={`/coach/awards/${candidate.playerId}`} className="text-[15px] font-bold underline-offset-2 hover:underline">
          {candidate.name}
        </Link>
        <span className="text-[13px] text-ink-muted">
          {candidate.group} · {candidate.count} {unit}
        </span>
      </span>
      <form action={setBadge}>
        <input type="hidden" name="player" value={candidate.playerId} />
        <input type="hidden" name="badge" value={badge.id} />
        <input type="hidden" name="give" value="yes" />
        <button type="submit" className="btn-chunky btn-paper btn-small" aria-label={`Award ${badge.name} to ${candidate.name}`}>
          Award
        </button>
      </form>
    </li>
  );
}
