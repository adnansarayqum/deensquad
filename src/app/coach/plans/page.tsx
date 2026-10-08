import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { clock, shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { SESSION_COLUMNS, toSession, type SessionRow } from "@/lib/parent/data";
import { loadPlans } from "@/lib/plans/data";

export const metadata: Metadata = { title: "Session plans" };

/** Sessions listed by default; "Show more" (`?all=1`) lists the rest. */
const SESSIONS_SHOWN = 6;
const SESSIONS_LOADED = 40;

export default async function PlansPage({ searchParams }: PageProps<"/coach/plans">) {
  const user = await requireStaff();
  const groups = staffGroups(user.staff);
  const now = new Date();
  const showAll = (await searchParams).all === "1";
  const { sessions, plans, filled } = await asUser(user.id, async (tx) => {
    const sessions = (
      await tx.query<SessionRow>(
        `select ${SESSION_COLUMNS} from sessions s
         where s.ends_at > $1 and s.cancelled_at is null and s.age_groups::text[] && $2::text[]
         order by s.starts_at limit ${SESSIONS_LOADED}`,
        [now, groups],
      )
    ).map(toSession);
    // Which of each session's groups have children in it (a squad session: picked children), so empty groups aren't listed.
    const filled = await tx.query<{ session_id: string; age_group: string }>(
      `select distinct s.id as session_id, p.age_group::text as age_group
       from sessions s join players p on p.age_group = any (s.age_groups) and squad_allows(s.id, p.id)
       where s.id = any ($1::uuid[])`,
      [sessions.map((s) => s.id)],
    );
    return { sessions, plans: await loadPlans(tx, sessions.map((s) => s.id), groups), filled };
  });
  // Every one of the session's groups the staff member covers is listed, so a plan can be added ahead of
  // children joining; a group with no children for the session yet says so beside it.
  const listed = (s: (typeof sessions)[number]) => s.ageGroups.filter((g) => groups.includes(g));
  const empty = (s: (typeof sessions)[number], g: string) => !filled.some((f) => f.session_id === s.id && f.age_group === g);
  const shown = showAll ? sessions : sessions.slice(0, SESSIONS_SHOWN);
  const planFor = (s: (typeof sessions)[number], g: string) => plans.find((p) => p.sessionId === s.id && p.ageGroup === g);
  const planText = (plan: ReturnType<typeof planFor>) =>
    plan?.body?.split("\n")[0] ?? (plan?.file ? plan.file.name : plan?.video ? "YouTube video" : "No plan yet");
  const linkName = (s: (typeof sessions)[number], g: string, plan: ReturnType<typeof planFor>) =>
    // Named in full: a list of "U10 · No plan yet · Add plan" links can't otherwise be told apart.
    `${plan ? "Edit" : "Add"} ${g} plan for ${s.title}, ${shortDay(s.startsAt)}${plan ? " (plan added)" : ""}`;

  return (
    <>
      <PageHeader
        title="Session plans"
        subtitle="Tell parents what each group will work on. They see it on the Friday screen."
        actions={
          <Link href="/coach/practice" className="btn-chunky btn-paper btn-small">
            Home practice sheets
          </Link>
        }
      />
      {sessions.length === 0 ? <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px] text-ink-muted">No sessions coming up for your groups. Add them under Sessions.</p> : null}

      {/* Phones: a row per group under each session's heading. */}
      <div className="flex flex-col gap-4 lg:hidden">
        {shown.map((s) => (
          <section key={s.id} aria-label={`${shortDay(s.startsAt)} ${s.title}`} className="flex flex-col gap-2">
            <h2 className="text-label text-ink-muted uppercase">
              {shortDay(s.startsAt)} · {s.title} {clock(s.startsAt)}
            </h2>
            {listed(s).length === 0 ? <p className="text-[15px] text-ink-muted">No children in this session&apos;s groups yet.</p> : null}
            {listed(s).map((g) => {
              const plan = planFor(s, g);
              return (
                <Link
                  key={g}
                  href={`/coach/plans/${s.id}?group=${g}`}
                  aria-label={linkName(s, g, plan)}
                  className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-3 shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none"
                >
                  <span className="font-display text-[26px] leading-none">{g}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] text-ink-muted">{planText(plan)}</span>
                    {empty(s, g) ? <span className="text-[13px] text-ink-muted">No children yet</span> : null}
                  </span>
                  {plan?.video ? <Pill tone="neutral">Video</Pill> : null}
                  {plan ? <Pill tone="done" icon>Plan added</Pill> : <Pill tone="action">Add plan</Pill>}
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
                </Link>
              );
            })}
          </section>
        ))}
      </div>

      {/* Computers: one table, a light row per session and a row per group under it. */}
      {sessions.length ? (
        <div className="hidden overflow-x-auto rounded-app border-2 border-line bg-paper lg:block">
          <table className="w-full text-[14px]">
            <caption className="sr-only">Session plans by session and group</caption>
            <thead>
              <tr className="border-b-2 border-line text-left text-label text-ink-muted uppercase">
                <th scope="col" className="px-4 py-2.5 font-bold">
                  Session
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Group
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Plan
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Action
                </th>
              </tr>
            </thead>
            {shown.map((s) => (
              <tbody key={s.id}>
                <tr className="border-t border-line bg-cream">
                  <th scope="rowgroup" colSpan={4} className="px-4 py-2 text-left text-[13px] font-bold">
                    {shortDay(s.startsAt)} · {s.title} {clock(s.startsAt)}
                  </th>
                </tr>
                {listed(s).length === 0 ? (
                  <tr className="border-t border-line">
                    <td colSpan={4} className="px-4 py-2 text-ink-muted">
                      No children in this session&apos;s groups yet.
                    </td>
                  </tr>
                ) : null}
                {listed(s).map((g) => {
                  const plan = planFor(s, g);
                  return (
                    <tr key={g} className="border-t border-line align-middle hover:bg-cream">
                      <td className="px-4 py-2" />
                      <th scope="row" className="px-3 py-2 text-left font-display text-[22px] leading-none">
                        {g}
                      </th>
                      <td className="max-w-md px-3 py-2">
                        <span className="flex items-center gap-2.5">
                          {plan ? <Pill tone="done" icon>Plan added</Pill> : <Pill tone="action">No plan yet</Pill>}
                          {plan?.video ? <Pill tone="neutral">Video</Pill> : null}
                          {plan ? <span className="truncate text-ink-muted">{planText(plan)}</span> : null}
                          {empty(s, g) ? <span className="shrink-0 text-[13px] text-ink-muted">No children yet</span> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/coach/plans/${s.id}?group=${g}`} aria-label={linkName(s, g, plan)} className="btn-chunky btn-paper btn-small">
                          {plan ? "Edit plan" : "Add plan"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      ) : null}

      {showAll || sessions.length <= SESSIONS_SHOWN ? null : (
        <Link href="/coach/plans?all=1" className="inline-flex min-h-12 items-center self-start text-sm font-bold text-grass-text underline">
          Show more ({sessions.length - SESSIONS_SHOWN} more {sessions.length - SESSIONS_SHOWN === 1 ? "session" : "sessions"})
        </Link>
      )}
    </>
  );
}
