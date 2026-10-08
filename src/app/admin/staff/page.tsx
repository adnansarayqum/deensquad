import type { Metadata } from "next";
import { AdminTitle, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { addStaff, removeStaff, setStaffGroups, setStaffRole } from "@/lib/admin/actions";
import { loadStaff } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { AGE_GROUPS, type AgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const user = await requireAdmin();
  const staff = await asUser(user.id, loadStaff);
  const admins = staff.filter((s) => s.role === "admin").length;

  return (
    <>
      <AdminTitle>Staff</AdminTitle>
      <p className="text-[15px] leading-[22px] text-ink-muted">
        Coaches take the register and post news for the age groups ticked
        against them (none ticked means every group). Admins see the whole club
        and can also import families, send invites, run the shop and manage
        staff. Make someone an admin or a coach at any time; the club always
        keeps at least one admin.
      </p>

      <ul className="grid gap-2 lg:grid-cols-2 lg:items-start">
        {staff.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-2 rounded-app border-2 border-line bg-paper px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-[15px] font-bold">
                  {s.displayName}
                  {s.id === user.staff.id ? (
                    <span className="font-normal text-ink-muted"> (you)</span>
                  ) : null}
                </span>
                <span className="text-[13px] text-ink-muted">{s.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <Pill tone={s.role === "admin" ? "gold" : "neutral"}>
                  {s.role === "admin" ? "Admin" : "Coach"}
                </Pill>
                {s.signedIn ? <Pill tone="done">Signed in</Pill> : null}
                {s.id !== user.staff.id &&
                !(s.role === "admin" && admins <= 1) ? (
                  <details className="group">
                    <summary className="flex min-h-12 cursor-pointer items-center px-2 text-sm font-bold text-ink-muted underline">
                      Remove<span className="sr-only"> {s.displayName}</span>
                    </summary>
                    <form action={removeStaff} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
                        <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 accent-[var(--kit-orange)]" />
                        Yes, remove {s.displayName}
                      </label>
                      <button type="submit" className="btn-chunky btn-paper btn-small self-start">
                        Remove {s.displayName}
                      </button>
                    </form>
                  </details>
                ) : null}
              </span>
            </div>
            {s.id !== user.staff.id &&
            !(s.role === "admin" && admins <= 1) ? (
              <form action={setStaffRole}>
                <input type="hidden" name="id" value={s.id} />
                <input
                  type="hidden"
                  name="role"
                  value={s.role === "admin" ? "coach" : "admin"}
                />
                <button
                  type="submit"
                  className="btn-chunky btn-paper btn-small min-h-12"
                  aria-label={`Make ${s.displayName} ${s.role === "admin" ? "a coach" : "an admin"}`}
                >
                  {s.role === "admin" ? "Make coach" : "Make admin"}
                </button>
                <span className="mt-1 block text-[13px] text-ink-muted">
                  {s.role === "admin"
                    ? "They'll coach every group until you tick theirs."
                    : "Admins see every group and run the shop."}
                </span>
              </form>
            ) : null}
            {s.role === "coach" ? (
              <form
                action={setStaffGroups}
                className="flex flex-wrap items-center gap-2"
                aria-label={`${s.displayName}'s age groups`}
              >
                <input type="hidden" name="id" value={s.id} />
                <GroupBoxes selected={s.ageGroups} />
                <button
                  type="submit"
                  className="btn-chunky btn-paper btn-small"
                >
                  Save groups
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      <Section title="Add a coach or admin">
        <StatefulForm
          action={addStaff}
          submitLabel="Add"
          savedMessage="Added. They can sign in with that email straight away."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="field-label">
                Name parents see
              </label>
              <input
                id="name"
                name="name"
                placeholder="Coach Bilal"
                maxLength={60}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                className="field"
              />
            </div>
          </div>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="field-label">Role</legend>
            <label className="flex min-h-11 items-center gap-2 text-[15px] font-bold">
              <input
                type="radio"
                name="role"
                value="coach"
                defaultChecked
                className="h-5 w-5 accent-[var(--grass)]"
              />
              Coach
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[15px] font-bold">
              <input
                type="radio"
                name="role"
                value="admin"
                className="h-5 w-5 accent-[var(--grass)]"
              />
              Admin
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="field-label">
              Coach&apos;s age groups{" "}
              <span className="font-normal text-ink-muted">
                (none ticked means every group)
              </span>
            </legend>
            <div className="flex flex-wrap gap-2">
              <GroupBoxes selected={[]} />
            </div>
          </fieldset>
        </StatefulForm>
      </Section>
    </>
  );
}

function GroupBoxes({ selected }: { selected: AgeGroup[] }) {
  return AGE_GROUPS.map((g) => (
    <label
      key={g}
      className="flex min-h-11 items-center gap-2 rounded-pill border-2 border-line bg-paper px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint"
    >
      <input
        type="checkbox"
        name="groups"
        value={g}
        defaultChecked={selected.includes(g)}
        className="h-4 w-4 accent-[var(--grass)]"
      />
      <span className="text-sm font-extrabold">{g}</span>
    </label>
  ));
}
