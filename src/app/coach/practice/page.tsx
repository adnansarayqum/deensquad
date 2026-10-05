import type { Metadata } from "next";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Attachment } from "@/components/plans/Attachment";
import { StaffShell } from "@/components/plans/StaffShell";
import { PracticeFromPlan, WritingHelp } from "@/components/writing/WritingHelp";
import { aiConfigured } from "@/lib/ai/claude";
import { shortDay } from "@/lib/dates";
import { iso } from "@/lib/db/types";
import { Card, Pill } from "@/components/ui";
import { isGroupCoach, requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { addPracticeSheet, deletePracticeSheet } from "@/lib/plans/actions";
import { loadPracticeSheets } from "@/lib/plans/data";

export const metadata: Metadata = { title: "Home practice" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function StaffPracticePage() {
  const user = await requireStaff();
  const groups = staffGroups(user.staff);
  const limited = isGroupCoach(user.staff);
  const ai = aiConfigured();
  const [sheets, plans] = await asUser(user.id, (tx) =>
    Promise.all([
      loadPracticeSheets(tx, groups),
      tx.query<{ id: string; age_group: string; body: string; starts_at: Date; title: string }>(
        `select sp.id, sp.age_group::text as age_group, sp.body, s.starts_at, s.title
         from session_plans sp join sessions s on s.id = sp.session_id
         where sp.body is not null and sp.age_group::text = any ($1::text[]) and s.starts_at > now() - interval '10 days'
         order by s.starts_at desc limit 10`,
        [groups],
      ),
    ]),
  );
  const recentPlans = plans.map((p) => ({ id: p.id, label: `${p.age_group} · ${shortDay(iso(p.starts_at))}`, text: p.body }));

  return (
    <StaffShell back="/coach/plans" backLabel="Session plans" title="Home practice" intro="Drills and crib sheets for families to try at home. Parents find them on the Friday screen.">
      <div className="rounded-app border-2 border-line bg-paper p-4">
        <StatefulForm action={addPracticeSheet} submitLabel="Share with parents" savedMessage="Shared. Parents in those groups can see it now.">
          {ai ? <PracticeFromPlan plans={recentPlans} titleId="title" bodyId="body" /> : null}
          <div>
            <label htmlFor="title" className="field-label">
              Title
            </label>
            <input id="title" name="title" maxLength={120} placeholder="Keepy-uppy challenge" className="field" />
          </div>
          <div>
            <label htmlFor="body" className="field-label">
              Instructions <span className="font-normal text-ink-muted">(optional if you attach a sheet)</span>
            </label>
            <textarea id="body" name="body" rows={5} maxLength={4000} placeholder="10 minutes a day. Count your best score and tell your coach on Friday." className="field" />
            <div className="mt-2">
              <WritingHelp bodyId="body" titleId="title" kind="practice" ai={ai} />
            </div>
          </div>
          <div>
            <label htmlFor="file" className="field-label">
              Attach a PDF or photo <span className="font-normal text-ink-muted">(optional, up to 8 MB)</span>
            </label>
            <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="field py-3 text-[15px]" />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="field-label">
              Who is it for? {limited ? null : <span className="font-normal text-ink-muted">(none ticked means every group)</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <label key={g} className="flex min-h-11 items-center gap-2 rounded-pill border-2 border-line bg-paper px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
                  <input type="checkbox" name="groups" value={g} defaultChecked={limited && groups.length === 1} className="h-4 w-4 accent-[var(--grass)]" />
                  <span className="text-sm font-extrabold">{g}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </StatefulForm>
      </div>

      <h2 className="mt-2 text-label text-ink-muted uppercase">Shared</h2>
      {sheets.length === 0 ? <Card className="p-4 text-[15px] text-ink-muted">Nothing shared yet.</Card> : null}
      {sheets.map((s) => (
        <Card key={s.id} className="flex flex-col gap-2 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-extrabold">{s.title}</h3>
            <Pill tone="neutral">{s.ageGroups.length ? s.ageGroups.join(", ") : "Everyone"}</Pill>
          </div>
          {s.body ? <p className="text-[15px] leading-[22px] whitespace-pre-line">{s.body}</p> : null}
          {s.file ? <Attachment file={s.file} /> : null}
          <div className="flex items-center justify-between gap-2 text-[13px] text-ink-muted">
            <span>{[s.from, day.format(new Date(s.createdAt))].filter(Boolean).join(" · ")}</span>
            {user.staff.role === "admin" || s.postedById === user.staff.id ? (
              <form action={deletePracticeSheet}>
                <input type="hidden" name="sheet" value={s.id} />
                <button type="submit" className="min-h-11 px-1 font-bold underline">
                  Remove
                </button>
              </form>
            ) : null}
          </div>
        </Card>
      ))}
    </StaffShell>
  );
}
