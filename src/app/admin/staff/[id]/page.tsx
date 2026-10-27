import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FoldCard, PageHeader, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { ClearancePill } from "@/components/admin/ClearancePill";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { deleteStaffCheckAction, saveStaffCheckAction } from "@/lib/staff-checks/actions";
import { CHECK_KINDS, checkName, checkState, clearance, dayText, expiryText, londonIsoDay, type StaffCheck } from "@/lib/staff-checks/checks";
import { loadStaffChecksFor } from "@/lib/staff-checks/data";

export const metadata: Metadata = { title: "Staff checks" };

/** One member of staff's DBS and certificates (admins only): what they have, when each runs out, add or change one. */
export default async function StaffChecksPage({ params }: PageProps<"/admin/staff/[id]">) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await asUser(user.id, async (tx) => {
    const [person] = await tx.query<{ id: string; display_name: string; role: string; email: string }>(
      `select id, display_name, role::text as role, email from staff where id = $1`,
      [id],
    );
    return person ? { person, checks: await loadStaffChecksFor(tx, id) } : null;
  });
  if (!data) notFound();
  const { person, checks } = data;
  const today = londonIsoDay(new Date());
  const summary = clearance(checks, today);

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin/staff", label: "Staff" }} title={person.display_name} subtitle={`${person.role === "admin" ? "Admin" : "Coach"} · ${person.email}`}>
        <p className="flex flex-wrap items-center gap-2 text-[15px]">
          <ClearancePill state={summary.state} words={summary.words} />
        </p>
      </PageHeader>

      <Section title="DBS and certificates">
        {checks.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Nothing recorded yet. Every coach and admin needs a DBS check.</p>
        ) : (
          <ul className="flex flex-col">
            {checks.map((c) => (
              <li key={c.id} className="border-t border-line py-3 first:border-t-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold">{checkName(c)}</p>
                    <p className="text-[13px] text-ink-muted">
                      {[c.issuedOn ? `Issued ${dayText(c.issuedOn)}` : null, expiryText(c, today), c.reference ? `Ref ${c.reference}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <StatePill check={c} today={today} />
                </div>
                <details className="mt-1">
                  <summary className="inline-flex min-h-12 cursor-pointer items-center text-sm font-bold text-grass-text underline underline-offset-4">
                    Change<span className="sr-only"> {checkName(c)}</span>
                  </summary>
                  <div className="flex flex-col gap-3 pt-2">
                    <CheckForm staffId={person.id} check={c} />
                    <form action={deleteStaffCheckAction} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <input type="hidden" name="staff" value={person.id} />
                      <input type="hidden" name="check" value={c.id} />
                      <label className="flex min-h-12 items-center gap-2 text-sm font-bold">
                        <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 accent-[var(--kit-orange)]" />
                        Yes, remove this
                      </label>
                      <button type="submit" className="btn-chunky btn-paper btn-small">
                        Remove {checkName(c)}
                      </button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <FoldCard id="add-check" title="Add a check or certificate" open={checks.length === 0}>
        <CheckForm staffId={person.id} check={null} />
      </FoldCard>
    </div>
  );
}

function CheckForm({ staffId, check }: { staffId: string; check: StaffCheck | null }) {
  const key = check?.id ?? "new";
  return (
    <StatefulForm action={saveStaffCheckAction} submitLabel={check ? "Save changes" : "Add"} savedMessage={check ? "Saved." : "Added."}>
      <input type="hidden" name="staff" value={staffId} />
      {check ? <input type="hidden" name="check" value={check.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`kind-${key}`} className="field-label">
            What it is
          </label>
          <select id={`kind-${key}`} name="kind" defaultValue={check?.kind ?? "dbs"} className="field">
            {Object.entries(CHECK_KINDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`title-${key}`} className="field-label">
            Name <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id={`title-${key}`} name="title" maxLength={80} defaultValue={check?.title ?? ""} placeholder="FA Introduction to Coaching Football" className="field" />
        </div>
        <div>
          <label htmlFor={`issued-${key}`} className="field-label">
            Issued <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id={`issued-${key}`} name="issuedOn" type="date" defaultValue={check?.issuedOn ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor={`expires-${key}`} className="field-label">
            Runs out <span className="font-normal text-ink-muted">(blank if it doesn&apos;t)</span>
          </label>
          <input id={`expires-${key}`} name="expiresOn" type="date" defaultValue={check?.expiresOn ?? ""} className="field" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`ref-${key}`} className="field-label">
            Certificate number <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id={`ref-${key}`} name="reference" maxLength={40} defaultValue={check?.reference ?? ""} className="field" />
        </div>
      </div>
    </StatefulForm>
  );
}

function StatePill({ check, today }: { check: StaffCheck; today: string }) {
  const state = checkState(check, today);
  if (state === "expired") return <Pill tone="action">Ran out</Pill>;
  if (state === "due") return <Pill tone="action">Runs out soon</Pill>;
  return <Pill tone="done">Up to date</Pill>;
}
