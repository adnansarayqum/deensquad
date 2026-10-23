import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { loadWhoIsComing, type ComingAnswer, type ComingChild } from "@/lib/admin/coming";
import { registerHref } from "@/lib/admin/overview";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { clock, shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { AGE_GROUPS } from "@/lib/domain";

export const metadata: Metadata = { title: "Who's coming" };

const SECTIONS: { answer: ComingAnswer; id: string; title: string }[] = [
  { answer: "coming", id: "coming", title: "Coming" },
  { answer: "away", id: "not-coming", title: "Not coming" },
  { answer: "none", id: "not-answered", title: "Not answered yet" },
];

/**
 * The children behind the overview's "47 of 100 coming", by name: who's coming, who isn't (with the reason the family
 * gave) and who hasn't answered, for every group or one. The owner asked for exactly this from the dashboard figure.
 */
export default async function WhoIsComingPage({ searchParams }: PageProps<"/admin/coming">) {
  const user = await requireStaff();
  const { group: asked } = await searchParams;
  const data = await asUser(user.id, (tx) => loadWhoIsComing(tx, new Date(), coachLimit(user.staff)));

  if (!data) {
    return (
      <div className="flex flex-col gap-4 lg:max-w-3xl">
        <PageHeader back={{ href: "/admin", label: "Overview" }} title="Who's coming" />
        <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px]">No session coming up.</p>
      </div>
    );
  }

  const group = AGE_GROUPS.find((g) => g === asked && data.groups.includes(g)) ?? null;
  const children = group ? data.children.filter((c) => c.group === group) : data.children;
  const sessions = group ? data.sessions.filter((s) => s.groups.includes(group)) : data.sessions;
  const counts = Object.fromEntries(SECTIONS.map((s) => [s.answer, children.filter((c) => c.answer === s.answer).length])) as Record<ComingAnswer, number>;
  const showGroup = !group && data.groups.length > 1;
  const register = sessions.length === 1 ? registerHref(sessions[0].id, group ? [group] : sessions[0].groups) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: "/admin", label: "Overview" }}
        title="Who's coming"
        subtitle={sessions.map((s) => `${s.title}, ${shortDay(s.startsAt)}, ${clock(s.startsAt)}`).join(" · ")}
        actions={
          register ? (
            <Link href={register} className="btn-chunky btn-paper btn-small">
              Open the register
            </Link>
          ) : null
        }
      >
        {data.groups.length > 1 ? (
          <nav aria-label="Groups" className="flex flex-wrap gap-2">
            {[null, ...data.groups].map((g) => (
              <Link
                key={g ?? "all"}
                href={g ? `/admin/coming?group=${g}` : "/admin/coming"}
                aria-current={g === group ? "page" : undefined}
                className={`inline-flex min-h-12 items-center rounded-pill border-2 px-4 text-sm font-extrabold ${
                  g === group ? "border-grass bg-grass-tint text-grass-text" : "border-line bg-paper text-ink"
                }`}
              >
                {g ?? "All"}
              </Link>
            ))}
          </nav>
        ) : null}
      </PageHeader>

      <ul aria-label="Answers" className="grid grid-cols-3 gap-2">
        {SECTIONS.map((s) => (
          <li key={s.answer}>
            <a href={`#${s.id}`} className="flex min-h-12 flex-col rounded-app border-2 border-line bg-paper px-3 py-2.5">
              <span className={`font-display text-[34px] leading-none ${s.answer === "coming" ? "text-grass-text" : ""}`}>{counts[s.answer]}</span>
              <span className="text-[13px] font-bold text-ink-muted">{s.title.toLowerCase()}</span>
            </a>
          </li>
        ))}
      </ul>

      {SECTIONS.map((s) => (
        <AnswerList key={s.answer} id={s.id} title={s.title} list={children.filter((c) => c.answer === s.answer)} showGroup={showGroup} />
      ))}
    </div>
  );
}

function AnswerList({ id, title, list, showGroup }: { id: string; title: string; list: ComingChild[]; showGroup: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4 rounded-app border-2 border-line bg-paper p-4">
      <h2 id={`${id}-heading`} className="text-[17px] font-extrabold">
        {title} ({list.length})
      </h2>
      {list.length === 0 ? (
        <p className="mt-1 text-[15px] text-ink-muted">Nobody.</p>
      ) : (
        <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <li key={c.id} className="flex min-h-11 flex-col justify-center border-t border-line py-1.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0">
              <span className="flex items-center gap-2">
                <Link href={`/admin/families/${c.id}`} className="text-[15px] font-bold">
                  {c.firstName} {c.lastName}
                </Link>
                {showGroup ? <Pill tone="neutral">{c.group}</Pill> : null}
              </span>
              {c.reason ? <span className="text-[13px] text-ink-muted">Reason: {c.reason}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

