import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Attachment } from "@/components/plans/Attachment";
import { WritingHelp } from "@/components/writing/WritingHelp";
import { aiConfigured } from "@/lib/ai/claude";
import { StaffShell } from "@/components/plans/StaffShell";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { clock, shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { isAgeGroup } from "@/lib/domain";
import { SESSION_COLUMNS, toSession, type SessionRow } from "@/lib/parent/data";
import { deletePlan, savePlan } from "@/lib/plans/actions";
import { loadPlan } from "@/lib/plans/data";

export const metadata: Metadata = { title: "Session plan" };

export default async function PlanPage({ params, searchParams }: PageProps<"/coach/plans/[session]">) {
  const user = await requireStaff();
  const [{ session: id }, { group }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id) || !isAgeGroup(group) || !staffGroups(user.staff).includes(group)) notFound();
  const page = await asUser(user.id, async (tx) => {
    const [row] = await tx.query<SessionRow>(`select ${SESSION_COLUMNS} from sessions s where s.id = $1`, [id]);
    const session = row ? toSession(row) : null;
    return session && session.ageGroups.includes(group) ? { session, plan: await loadPlan(tx, id, group) } : null;
  });
  if (!page) notFound();
  const { session, plan } = page;

  return (
    <StaffShell back="/coach/plans" backLabel="Session plans" title={`${group} plan`} intro={`${shortDay(session.startsAt)} · ${session.title} ${clock(session.startsAt)}`}>
      <div className="rounded-app border-2 border-line bg-paper p-4">
        <StatefulForm action={savePlan} keepOnFailure="That didn't save. Your plan is still here." submitLabel={plan ? "Save changes" : "Share with parents"} savedMessage={`Saved. ${group} parents can see it on the Friday screen, and get a notification if they have them on.`}>
          <input type="hidden" name="session" value={session.id} />
          <input type="hidden" name="group" value={group} />
          <div>
            <label htmlFor="body" className="field-label">
              What you&apos;ll work on
            </label>
            <textarea
              id="body"
              name="body"
              rows={8}
              maxLength={4000}
              defaultValue={plan?.body ?? ""}
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
              <label className="flex min-h-11 items-center gap-3 text-[15px]">
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
        </StatefulForm>
      </div>
      {plan ? (
        <form action={deletePlan}>
          <input type="hidden" name="plan" value={plan.id} />
          <button type="submit" className="min-h-11 px-1 text-sm font-bold text-ink-muted underline">
            Delete this plan
          </button>
        </form>
      ) : null}
    </StaffShell>
  );
}
