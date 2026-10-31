import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader, Section } from "@/components/admin/bits";
import { RatingsForm } from "@/components/progress/RatingsForm";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { londonIsoDate, shortDay } from "@/lib/dates";
import { groupPlural, isAgeGroup } from "@/lib/domain";
import { switchProgressForParents } from "@/lib/progress/actions";
import { RATE_DAYS, loadGroupAverages, loadRateRows, loadRateSessions } from "@/lib/progress/data";
import { CATEGORIES, oneDecimal } from "@/lib/progress/ratings";
import { progressForParents } from "@/lib/settings";

export const metadata: Metadata = { title: "Ratings" };

const tab = (active: boolean) =>
  `inline-flex min-h-12 min-w-14 items-center justify-center rounded-pill px-4 text-sm font-bold ${active ? "bg-floodlight text-on-gold" : "border border-line bg-paper text-ink"}`;

export default async function RatingsPage({ searchParams }: PageProps<"/coach/ratings">) {
  const user = await requireStaff();
  const groups = staffGroups(user.staff);
  const isAdmin = user.staff.role === "admin";
  const sp = await searchParams;
  const now = new Date();
  const today = londonIsoDate(now);

  const page = await asUser(user.id, async (tx) => {
    const sessions = await loadRateSessions(tx, now, groups);
    const session = sessions.find((s) => s.id === sp.session) ?? sessions[0] ?? null;
    const group = session ? (isAgeGroup(sp.group) && session.groups.includes(sp.group) ? sp.group : session.groups[0]) : null;
    const [rows, averages, shown] = await Promise.all([
      session && group ? loadRateRows(tx, session.id, group, user.staff.id) : Promise.resolve([]),
      loadGroupAverages(tx, groups, today),
      isAdmin ? progressForParents(tx) : Promise.resolve(false),
    ]);
    return { sessions, session, group, rows, averages, shown };
  });
  const { sessions, session, group, rows, averages, shown } = page;
  const link = (q: { session: string; group?: string }) => `/coach/ratings?${new URLSearchParams(q)}`;

  return (
    <>
      <PageHeader
        back={{ href: "/coach/awards", label: "Points and stars" }}
        title="Ratings"
        subtitle={session ? "Score each child from 1 to 5 in all five. Leave a row blank to skip a child." : `No sessions in the last ${RATE_DAYS} days for your groups.`}
      >
        {sessions.length > 1 ? (
          <nav aria-label="Sessions" className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <Link key={s.id} href={link({ session: s.id })} aria-current={s.id === session?.id ? "page" : undefined} className={tab(s.id === session?.id)}>
                {s.title} · {shortDay(s.startsAt)}
              </Link>
            ))}
          </nav>
        ) : session ? (
          <p className="-mt-1 text-[15px] text-ink-muted">
            {session.title} · {shortDay(session.startsAt)}
          </p>
        ) : null}
        {session && session.groups.length > 1 ? (
          <nav aria-label="Groups" className="flex flex-wrap gap-2">
            {session.groups.map((g) => (
              <Link key={g} href={link({ session: session.id, group: g })} aria-current={g === group ? "page" : undefined} className={tab(g === group)}>
                {g}
              </Link>
            ))}
          </nav>
        ) : null}
      </PageHeader>

      {session && group ? (
        rows.length ? (
          <RatingsForm key={`${session.id}-${group}`} sessionId={session.id} rows={rows} />
        ) : (
          <p className="text-[15px] text-ink-muted">No children in the {groupPlural(group)} for this session.</p>
        )
      ) : null}

      {averages.length ? (
        <Section title="Group averages this month" aside={<span className="text-[13px] text-ink-muted">Staff only, never shown to parents</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <caption className="sr-only">Average rating per category this month, by group</caption>
              <thead>
                <tr className="text-left text-[13px] font-bold text-ink-muted">
                  <th scope="col" className="py-1 pr-3 font-bold">
                    Category
                  </th>
                  {averages.map((a) => (
                    <th key={a.group} scope="col" className="py-1 pr-3 text-right font-bold">
                      {a.group}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((c) => (
                  <tr key={c.key} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {c.label}
                    </th>
                    {averages.map((a) => (
                      <td key={a.group} className="py-1.5 pr-3 text-right font-bold tabular-nums">
                        {oneDecimal(a.scores[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-line text-ink-muted">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    Ratings (children)
                  </th>
                  {averages.map((a) => (
                    <td key={a.group} className="py-1.5 pr-3 text-right tabular-nums">
                      {a.count} ({a.children})
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {isAdmin ? (
        <section id="parents-switch" aria-labelledby="parents-switch-title" className="flex scroll-mt-4 flex-col gap-3 rounded-app border border-line bg-paper p-4">
          <h2 id="parents-switch-title" className="text-[18px] font-bold">
            Parents see ratings and progress reports: {shown ? "On" : "Off"}
          </h2>
          {sp.switch === "on" ? <Notice>Switched on. Parents now see their own child&apos;s ratings and published reports. No emails were sent for earlier reports.</Notice> : null}
          {sp.switch === "off" ? <Notice>Switched off. Parents see nothing about ratings or reports.</Notice> : null}
          {sp.switch === "confirm" && !shown ? <Notice tone="action">Tick the box to switch it on.</Notice> : null}
          <p className="text-[15px] leading-[22px]">
            {shown
              ? "Each parent sees their own child's ratings (the last 3 months against the 3 before) and the reports you publish, on the player screen. Never other children's, and never group averages."
              : "Coaches can rate and write reports now; parents see nothing until you switch this on. Reports already published become visible then, without emailing anyone."}
          </p>
          <form action={switchProgressForParents} className="flex flex-col items-start gap-2">
            <input type="hidden" name="on" value={shown ? "no" : "yes"} />
            {shown ? null : (
              <label className="flex min-h-12 items-center gap-2 text-[15px] font-bold">
                <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
                Yes, show parents their child&apos;s ratings and published reports
              </label>
            )}
            <button type="submit" className="btn-chunky btn-paper">
              {shown ? "Switch off" : "Switch on"}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
