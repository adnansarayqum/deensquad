import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StaffShell } from "@/components/plans/StaffShell";
import { Card, Pill } from "@/components/ui";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { clock, shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { SESSION_COLUMNS, toSession, type SessionRow } from "@/lib/parent/data";
import { loadPlans } from "@/lib/plans/data";

export const metadata: Metadata = { title: "Session plans" };

export default async function PlansPage() {
  const user = await requireStaff();
  const groups = staffGroups(user.staff);
  const now = new Date();
  const { sessions, plans, filled } = await asUser(user.id, async (tx) => {
    const sessions = (
      await tx.query<SessionRow>(
        `select ${SESSION_COLUMNS} from sessions s
         where s.ends_at > $1 and s.cancelled_at is null and s.age_groups::text[] && $2::text[]
         order by s.starts_at limit 8`,
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
  // A group is listed when it has children for the session, or already has a plan.
  const listed = (s: (typeof sessions)[number]) =>
    s.ageGroups.filter(
      (g) => groups.includes(g) && (filled.some((f) => f.session_id === s.id && f.age_group === g) || plans.some((p) => p.sessionId === s.id && p.ageGroup === g)),
    );

  return (
    <StaffShell back={user.staff.role === "admin" ? "/admin" : "/coach"} backLabel={user.staff.role === "admin" ? "Club admin" : "Register"} title="Session plans" intro="Tell parents what each group will work on. They see it on the Friday screen.">
      <Link href="/coach/practice" className="btn-chunky btn-paper">
        Home practice sheets
      </Link>
      {sessions.length === 0 ? <Card className="p-4 text-[15px]">No sessions coming up for your groups. Add them in the club admin.</Card> : null}
      {sessions.map((s) => (
        <section key={s.id} aria-label={`${shortDay(s.startsAt)} ${s.title}`} className="flex flex-col gap-2">
          <h2 className="mt-1 text-label text-ink-muted uppercase">
            {shortDay(s.startsAt)} · {s.title} {clock(s.startsAt)}
          </h2>
          {listed(s).length === 0 ? <p className="text-[15px] text-ink-muted">No children in this session&apos;s groups yet.</p> : null}
          {listed(s).map((g) => {
            const plan = plans.find((p) => p.sessionId === s.id && p.ageGroup === g);
            return (
              <Link
                key={g}
                href={`/coach/plans/${s.id}?group=${g}`}
                // Named in full: a list of "U10 · No plan yet · Add plan" links can't otherwise be told apart.
                aria-label={`${plan ? "Edit" : "Add"} ${g} plan for ${s.title}, ${shortDay(s.startsAt)}${plan ? " (plan added)" : ""}`}
                className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-3 shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none"
              >
                <span className="font-display text-[26px] leading-none">{g}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] text-ink-muted">{plan?.body?.split("\n")[0] ?? (plan?.file ? plan.file.name : "No plan yet")}</span>
                </span>
                {plan ? <Pill tone="done" icon>Plan added</Pill> : <Pill tone="action">Add plan</Pill>}
                <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
              </Link>
            );
          })}
        </section>
      ))}
    </StaffShell>
  );
}
