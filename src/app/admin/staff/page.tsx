import type { Metadata } from "next";
import { AdminTitle, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { addStaff, removeStaff } from "@/lib/admin/actions";
import { loadStaff } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const user = await requireAdmin();
  const staff = await asUser(user.id, loadStaff);
  const admins = staff.filter((s) => s.role === "admin").length;

  return (
    <>
      <AdminTitle>Staff</AdminTitle>
      <p className="text-[15px] leading-[22px] text-ink-muted">
        Coaches can take the register, post news and see every family. Admins can also import families, send invites and manage staff.
      </p>

      <ul className="flex flex-col gap-2">
        {staff.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-app border-2 border-line bg-paper px-4 py-3">
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">
                {s.displayName}
                {s.id === user.staff.id ? <span className="font-normal text-ink-muted"> (you)</span> : null}
              </span>
              <span className="text-[13px] text-ink-muted">{s.email}</span>
            </span>
            <span className="flex items-center gap-2">
              <Pill tone={s.role === "admin" ? "gold" : "neutral"}>{s.role}</Pill>
              {s.signedIn ? <Pill tone="done">Signed in</Pill> : null}
              {s.id !== user.staff.id && !(s.role === "admin" && admins <= 1) ? (
                <form action={removeStaff}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="min-h-11 px-2 text-sm font-bold text-ink-muted underline" aria-label={`Remove ${s.displayName}`}>
                    Remove
                  </button>
                </form>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <Section title="Add a coach or admin">
        <StatefulForm action={addStaff} submitLabel="Add" savedMessage="Added. They can sign in with that email straight away." resetOnSave>
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
        </StatefulForm>
      </Section>
    </>
  );
}
