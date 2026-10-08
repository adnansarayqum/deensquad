import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import { PageHeader } from "@/components/admin/bits";
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
    <>
      <PageHeader title="Points and stars" subtitle="Tap a player to give points, a star or a note for their parents.">
        {groups.length > 1 ? (
          <nav aria-label="Groups" className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Link
                key={g}
                href={`/coach/awards?group=${g}`}
                aria-current={g === group ? "page" : undefined}
                className={`inline-flex min-h-12 min-w-14 items-center justify-center rounded-pill px-4 text-sm font-extrabold ${g === group ? "bg-floodlight text-on-gold" : "border-2 border-line bg-paper text-ink"}`}
              >
                {g}
              </Link>
            ))}
          </nav>
        ) : null}
      </PageHeader>
      <section aria-label={groupPlural(group)} className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
        <h2 className="text-[17px] font-extrabold">{groupPlural(group)}</h2>
        {squad.length === 0 ? <p className="text-[15px] text-ink-muted">No players in the {groupPlural(group)} yet.</p> : null}
        {squad.length ? (
          <ul className="grid gap-2 lg:grid-cols-2">
            {squad.map((p) => (
              <li key={p.id}>
                <Link href={`/coach/awards/${p.id}`} className="flex min-h-14 items-center gap-3 rounded-dash border-2 border-line bg-cream px-3.5 py-2 hover:bg-paper">
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
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}
