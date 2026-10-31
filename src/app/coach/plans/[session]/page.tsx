import { ConfirmDelete } from "@/components/admin/ConfirmDelete";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Attachment } from "@/components/plans/Attachment";
import { VideoField } from "@/components/plans/VideoField";
import { WritingHelp } from "@/components/writing/WritingHelp";
import { aiConfigured } from "@/lib/ai/claude";
import { PageHeader } from "@/components/admin/bits";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { clock, shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { isAgeGroup } from "@/lib/domain";
import { SESSION_COLUMNS, toSession, type SessionRow } from "@/lib/parent/data";
import { deletePlan, savePlan } from "@/lib/plans/actions";
import { loadPlan } from "@/lib/plans/data";
import { canonicalYouTube } from "@/lib/video";

export const metadata: Metadata = { title: "Session plan" };

export default async function PlanPage({ params, searchParams }: PageProps<"/coach/plans/[session]">) {
  const user = await requireStaff();
  const [{ session: id }, { group, copy }] = await Promise.all([params, searchParams]);
  // A plan link without its group (shared or bookmarked) goes to the plans list rather than "Page not found".
  if (UUID.test(id) && !isAgeGroup(group)) redirect("/coach/plans");
  if (!UUID.test(id) || !isAgeGroup(group) || !staffGroups(user.staff).includes(group)) notFound();
  const page = await asUser(user.id, async (tx) => {
    const [row] = await tx.query<SessionRow>(`select ${SESSION_COLUMNS} from sessions s where s.id = $1`, [id]);
    const session = row ? toSession(row) : null;
    if (!session || !session.ageGroups.includes(group)) return null;
    // The group's most recent earlier plan, to start from instead of a blank box.
    const [earlier] = await tx.query<{ body: string | null; starts_at: Date }>(
      `select sp.body, s.starts_at from session_plans sp join sessions s on s.id = sp.session_id
       where sp.age_group = $1::age_group and s.starts_at < $2 and sp.body is not null and sp.body <> ''
       order by s.starts_at desc limit 1`,
      [group, session.startsAt],
    );
    return { session, plan: await loadPlan(tx, id, group), earlier: earlier ? { body: earlier.body ?? "", at: new Date(earlier.starts_at).toISOString() } : null };
  });
  if (!page) notFound();
  const { session, plan, earlier } = page;
  const copying = !plan && copy === "1" && earlier ? earlier : null;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/coach/plans", label: "Session plans" }} title={`${group} plan`} subtitle={`${shortDay(session.startsAt)} · ${session.title} ${clock(session.startsAt)}`} />
      <div className="rounded-app border border-line bg-paper p-4">
        <StatefulForm action={savePlan} keepOnFailure="That didn't save. Your plan is still here." submitLabel={plan ? "Save changes" : "Share with parents"} savedMessage={`Saved. ${group} parents can see it on the Friday screen, and get a notification if they have them on.`}>
          <input type="hidden" name="session" value={session.id} />
          <input type="hidden" name="group" value={group} />
          {!plan && earlier ? (
            copying ? (
              <p className="rounded-app bg-grass-tint px-3.5 py-2.5 text-[15px]">Started from the plan for {shortDay(earlier.at)}. Change what you need, then share it.</p>
            ) : (
              <Link href={`/coach/plans/${session.id}?group=${group}&copy=1`} className="inline-flex min-h-12 items-center self-start text-[15px] font-bold text-grass-text underline">
                Start from the last plan ({shortDay(earlier.at)})
              </Link>
            )
          ) : null}
          <div>
            <label htmlFor="body" className="field-label">
              What you&apos;ll work on
            </label>
            <textarea
              id="body"
              name="body"
              rows={8}
              maxLength={4000}
              defaultValue={plan?.body ?? copying?.body ?? ""}
              placeholder={"Warm-up: rondos\nMain: passing on the move, first touch away from pressure\nGame: 5 v 5, two-touch"}
              className="field"
            />
            <div className="mt-2">
              <WritingHelp bodyId="body" kind="plan" ai={aiConfigured()} context={`Group: ${group}. Session: ${session.title}, ${shortDay(session.startsAt)}.`} />
            </div>
          </div>
          {plan?.file ? (
            <div className="flex flex-col gap-2">
              <span className="field-label">Attached</span>
              <Attachment file={plan.file} from={`/coach/plans/${session.id}?group=${group}`} />
              <label className="flex min-h-12 items-center gap-3 text-[15px]">
                <input type="checkbox" name="removeFile" className="h-5 w-5 accent-[var(--grass)]" />
                Remove this attachment
              </label>
            </div>
          ) : null}
          <div>
            <label htmlFor="file" className="field-label">
              {plan?.file ? "Replace with a new file" : "Attach a PDF or photo"} <span className="font-normal text-ink-muted">(optional, up to 8 MB)</span>
            </label>
            <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="field py-3 text-[15px]" />
          </div>
          <VideoField defaultValue={plan?.video ? canonicalYouTube(plan.video) : ""} />
        </StatefulForm>
      </div>
      {plan ? (
        <ConfirmDelete action={deletePlan} label="Delete this plan" confirmLabel="Yes, delete it" name={`${group} plan, ${shortDay(session.startsAt)}`}>
          <input type="hidden" name="plan" value={plan.id} />
        </ConfirmDelete>
      ) : null}
    </div>
  );
}
