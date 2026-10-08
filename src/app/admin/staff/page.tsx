import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FoldCard, PageHeader } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { addStaff, removeStaff, setStaffGroups, setStaffRole } from "@/lib/admin/actions";
import { loadStaff, type StaffRow } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { AGE_GROUPS, type AgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const user = await requireAdmin();
  const staff = await asUser(user.id, loadStaff);
  const admins = staff.filter((s) => s.role === "admin").length;
  // Never the last admin and never your own role (or removal).
  const changeable = (s: StaffRow) => s.id !== user.staff.id && !(s.role === "admin" && admins <= 1);

  const roleHint = (s: StaffRow) => (s.role === "admin" ? "They'll coach every group until you tick theirs." : "Admins see every group and run the shop.");
  // `compact`: the table's one-line rows (a text link, the hint in the footnote under the table); the phone cards keep the button and the sentence.
  const roleForm = (s: StaffRow, compact = false): ReactNode =>
    changeable(s) ? (
      <form action={setStaffRole} className={compact ? "" : "flex flex-col items-start gap-1"}>
        <input type="hidden" name="id" value={s.id} />
        <input type="hidden" name="role" value={s.role === "admin" ? "coach" : "admin"} />
        <button
          type="submit"
          className={compact ? "inline-flex min-h-12 items-center px-1.5 text-sm font-bold text-grass-text underline underline-offset-4" : "btn-chunky btn-paper btn-small min-h-12"}
          aria-label={`Make ${s.displayName} ${s.role === "admin" ? "a coach" : "an admin"}`}
          title={compact ? roleHint(s) : undefined}
        >
          {s.role === "admin" ? "Make coach" : "Make admin"}
        </button>
        {compact ? null : <span className="text-[13px] text-ink-muted">{roleHint(s)}</span>}
      </form>
    ) : null;
  const removeForm = (s: StaffRow): ReactNode =>
    changeable(s) ? (
      // One tap would remove them at once, so it opens a "Yes, remove" tick first (removeStaff checks confirm=yes).
      <details>
        <summary className="inline-flex min-h-12 cursor-pointer items-center px-1.5 text-sm font-bold text-ink-muted underline underline-offset-4">
          Remove<span className="sr-only"> {s.displayName}</span>
        </summary>
        <form action={removeStaff} className="mt-1 flex flex-col items-start gap-2">
          <input type="hidden" name="id" value={s.id} />
          <label className="flex min-h-12 items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 accent-[var(--kit-orange)]" />
            Yes, remove {s.displayName}
          </label>
          <button type="submit" className="btn-chunky btn-paper btn-small">
            Remove {s.displayName}
          </button>
        </form>
      </details>
    ) : null;
  const groupsForm = (s: StaffRow, compact = false): ReactNode =>
    s.role === "coach" ? (
      <form action={setStaffGroups} className={`flex items-center ${compact ? "flex-nowrap gap-0.5" : "flex-wrap gap-2"}`} aria-label={`${s.displayName}'s groups`}>
        <input type="hidden" name="id" value={s.id} />
        <GroupBoxes selected={s.ageGroups} small={compact} />
        <button type="submit" className="btn-chunky btn-paper btn-small shrink-0" aria-label={compact ? `Save ${s.displayName}'s groups` : undefined}>
          {compact ? "Save" : "Save groups"}
        </button>
      </form>
    ) : (
      <span className="text-[13px] text-ink-muted">Every group</span>
    );
  const name = (s: StaffRow) => (
    <>
      {s.displayName}
      {s.id === user.staff.id ? <span className="font-normal text-ink-muted"> (you)</span> : null}
    </>
  );

  return (
    <>
      <PageHeader title="Staff" subtitle="Coaches see the groups ticked against them; none ticked means every group. Admins see everything." />

      <FoldCard id="add-staff" title="Add a coach or admin">
        <StatefulForm action={addStaff} submitLabel="Add" savedMessage="Added. They can sign in with that email straight away.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="field-label">
                Name parents see
              </label>
              <input id="name" name="name" placeholder="Coach Bilal" maxLength={60} className="field" />
            </div>
            <div>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input id="email" name="email" type="email" inputMode="email" autoCapitalize="none" className="field" />
            </div>
          </div>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="field-label">Role</legend>
            <label className="flex min-h-11 items-center gap-2 text-[15px] font-bold">
              <input type="radio" name="role" value="coach" defaultChecked className="h-5 w-5 accent-[var(--grass)]" />
              Coach
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[15px] font-bold">
              <input type="radio" name="role" value="admin" className="h-5 w-5 accent-[var(--grass)]" />
              Admin
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="field-label">
              Coach&apos;s groups <span className="font-normal text-ink-muted">(none ticked means every group)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              <GroupBoxes selected={[]} />
            </div>
          </fieldset>
        </StatefulForm>
      </FoldCard>

      {/* Phones: one card per person. */}
      <ul className="flex flex-col gap-4 lg:hidden">
        {staff.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] font-bold">{name(s)}</span>
                <span className="text-[13px] break-all text-ink-muted">{s.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <Pill tone={s.role === "admin" ? "gold" : "neutral"}>{s.role === "admin" ? "Admin" : "Coach"}</Pill>
                {s.signedIn ? <Pill tone="done">Signed in</Pill> : <Pill tone="neutral">Not yet</Pill>}
              </span>
            </div>
            {groupsForm(s)}
            {changeable(s) ? (
              <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line pt-3">
                {roleForm(s)}
                {removeForm(s)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Computers: a table, one row per person. */}
      <div className="hidden overflow-x-auto rounded-app border-2 border-line bg-paper lg:block">
        <table className="w-full text-[14px]">
          <caption className="sr-only">Coaches and admins</caption>
          <thead>
            <tr className="border-b-2 border-line text-left text-label text-ink-muted uppercase">
              <th scope="col" className="py-2.5 pr-2 pl-2.5 font-bold">
                Name
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Email
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Role
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Signed in
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold">
                Groups
              </th>
              <th scope="col" className="w-px py-2.5 pr-1 pl-2 font-bold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-line align-middle">
                <th scope="row" className="py-1.5 pr-2 pl-2.5 text-left font-bold whitespace-nowrap">
                  {name(s)}
                </th>
                <td className="px-2 py-1.5 text-xs text-ink-muted">{s.email}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <Pill tone={s.role === "admin" ? "gold" : "neutral"}>{s.role === "admin" ? "Admin" : "Coach"}</Pill>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{s.signedIn ? <Pill tone="done">Signed in</Pill> : <Pill tone="neutral">Not yet</Pill>}</td>
                <td className="px-2 py-1.5">{groupsForm(s, true)}</td>
                <td className="py-1.5 pr-1 pl-2 whitespace-nowrap">
                  {changeable(s) ? (
                    <div className="-ml-1.5 flex items-center">
                      {roleForm(s, true)}
                      {removeForm(s)}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2.5 text-[13px] text-ink-muted">A new admin sees every group and runs the shop. Someone made a coach coaches every group until you tick theirs.</p>
      </div>

    </>
  );
}

function GroupBoxes({ selected, small = false }: { selected: AgeGroup[]; /** The staff table's one-line rows: smaller chips. */ small?: boolean }) {
  return AGE_GROUPS.map((g) => (
    <label key={g} className={`flex items-center rounded-pill border-2 border-line bg-paper has-[:checked]:border-grass has-[:checked]:bg-grass-tint ${small ? "min-h-9 gap-1 px-1.5" : "min-h-11 gap-2 px-3.5"}`}>
      <input type="checkbox" name="groups" value={g} defaultChecked={selected.includes(g)} className={`accent-[var(--grass)] ${small ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
      <span className="text-sm font-extrabold">{g}</span>
    </label>
  ));
}
