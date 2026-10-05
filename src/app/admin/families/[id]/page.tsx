import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { removeChild, resendInvite, saveGuardian, setPayment, unlinkGuardian, updateChild } from "@/lib/admin/actions";
import { loadChild } from "@/lib/admin/data";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { AGE_GROUPS, type PaymentState } from "@/lib/domain";

export const metadata: Metadata = { title: "Child" };

const paymentLabel: Record<PaymentState, string> = {
  active: "Monthly plan active",
  self_reported: "Parent says it's set up",
  missing: "No payment plan",
  overdue: "Payment overdue",
};

export default async function ChildPage({ params, searchParams }: PageProps<"/admin/families/[id]">) {
  const user = await requireStaff();
  const { id } = await params;
  const flags = await searchParams;
  if (!UUID.test(id)) notFound();
  const child = await asUser(user.id, (tx) => loadChild(tx, id));
  if (!child) notFound();
  // A coach with their own groups sees only those children.
  const mine = coachLimit(user.staff);
  if (mine && !mine.includes(child.ageGroup)) notFound();
  const isAdmin = user.staff.role === "admin";

  return (
    // Forms and detail read best at phone-to-tablet width, even on a computer.
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Link href="/admin/families" className="inline-flex min-h-11 items-center text-sm font-bold text-grass-text">
        ← Families
      </Link>
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-pill bg-pitch font-display text-[28px] text-on-pitch">
          {child.shirtNumber ?? child.firstName[0]}
        </span>
        <div>
          <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">
            {child.firstName} {child.lastName}
          </h1>
          <p className="text-[15px] text-ink-muted">
            {child.ageGroup}s · {child.attended} {child.attended === 1 ? "session" : "sessions"} attended
          </p>
        </div>
      </div>

      {flags.invited ? <Notice>Invite sent.</Notice> : null}
      {flags.invite === "failed" ? <Notice tone="action">The invite wasn&apos;t sent. Try again later.</Notice> : null}
      {flags.invite === "no-email" ?<Notice tone="action">Email isn&apos;t set up yet. Add RESEND_API_KEY in Railway.</Notice> : null}

      <Section title="Payment" aside={<Pill tone={child.payment === "active" ? "done" : child.payment === "self_reported" ? "gold" : "action"}>{paymentLabel[child.payment]}</Pill>}>
        <p className="text-sm text-ink-muted">Set this after checking TeamFeePay.</p>
        <div className="flex flex-wrap gap-2">
          {(["active", "missing", "overdue"] as const).map((state) => (
            <form key={state} action={setPayment}>
              <input type="hidden" name="child" value={child.id} />
              <input type="hidden" name="state" value={state} />
              <button type="submit" disabled={child.payment === state} className="btn-chunky btn-paper btn-small">
                {state === "active" ? "Mark as active" : state === "missing" ? "No plan" : "Overdue"}
              </button>
            </form>
          ))}
        </div>
      </Section>

      <Section title={child.guardians.length === 1 ? "Parent" : "Parents"}>
        {child.guardians.length === 0 ? <p className="text-[15px] text-ink-muted">No parent linked yet.</p> : null}
        {child.guardians.map((g) => (
          <div key={g.id} className="flex flex-col gap-3 border-t border-line pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-base font-bold">{g.name}</span>
                <span className="text-sm text-ink-muted">{[g.email, g.phone].filter(Boolean).join(" · ")}</span>
                {g.otherChildren.length ? <span className="text-sm text-ink-muted">Also parent of {g.otherChildren.join(", ")}</span> : null}
              </div>
              {g.inApp ? <Pill tone="done">Signed in</Pill> : g.invited ? <Pill tone="gold">Invited</Pill> : <Pill tone="neutral">Not invited</Pill>}
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                {!g.inApp && g.email ? (
                  <form action={resendInvite}>
                    <input type="hidden" name="guardian" value={g.id} />
                    <input type="hidden" name="child" value={child.id} />
                    <button type="submit" className="btn-chunky btn-paper btn-small">
                      {g.invited ? "Send invite again" : "Send invite"}
                    </button>
                  </form>
                ) : null}
                <details className="w-full rounded-app border-2 border-line px-3.5 py-2.5">
                  <summary className="cursor-pointer text-sm font-bold">Edit {g.firstName}&apos;s details</summary>
                  <StatefulForm action={saveGuardian} submitLabel="Save parent" savedMessage="Parent saved." className="mt-3">
                    <input type="hidden" name="child" value={child.id} />
                    <input type="hidden" name="guardian" value={g.id} />
                    <GuardianFields prefix={`g-${g.id}`} first={g.firstName} last={g.lastName} email={g.email} phone={g.phone} />
                  </StatefulForm>
                  <form action={unlinkGuardian} className="mt-3">
                    <input type="hidden" name="child" value={child.id} />
                    <input type="hidden" name="guardian" value={g.id} />
                    <button type="submit" className="text-sm font-bold text-kit-orange underline">
                      Unlink {g.firstName} from {child.firstName}
                    </button>
                  </form>
                </details>
              </div>
            ) : null}
          </div>
        ))}
        {isAdmin ? (
          <details className="rounded-app border-2 border-dashed border-line px-3.5 py-2.5">
            <summary className="cursor-pointer text-sm font-bold">Add another parent</summary>
            <StatefulForm action={saveGuardian} submitLabel="Add parent" savedMessage="Parent added." resetOnSave className="mt-3">
              <input type="hidden" name="child" value={child.id} />
              <GuardianFields prefix="new-parent" />
            </StatefulForm>
          </details>
        ) : null}
      </Section>

      <Section title="From the parents">
        <dl className="grid gap-2 text-[15px] sm:grid-cols-2">
          <div>
            <dt className="text-sm text-ink-muted">Photo consent</dt>
            <dd className="font-bold">{child.photoConsent === null ? "Not answered" : child.photoConsent ? "Photos are fine" : "No photos"}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Emergency contacts</dt>
            <dd className="font-bold">
              {child.contacts.length === 0
                ? "None yet"
                : child.contacts.map((c) => `${c.name} ${c.phone}${c.relationship ? ` (${c.relationship})` : ""}`).join(" · ")}
            </dd>
          </div>
        </dl>
      </Section>

      {isAdmin ? (
        <Section title="Child's details">
          <StatefulForm action={updateChild} submitLabel="Save details" savedMessage="Details saved.">
            <input type="hidden" name="id" value={child.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" name="firstName" defaultValue={child.firstName} />
              <Field label="Last name" name="lastName" defaultValue={child.lastName} />
              <div>
                <label htmlFor="ageGroup" className="field-label">
                  Age group
                </label>
                <select id="ageGroup" name="ageGroup" defaultValue={child.ageGroup} className="field">
                  {AGE_GROUPS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
              <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={child.dateOfBirth ?? ""} />
              <Field label="Shirt number" name="shirtNumber" inputMode="numeric" defaultValue={child.shirtNumber?.toString() ?? ""} />
              <Field label="Position" name="position" defaultValue={child.position ?? ""} />
            </div>
          </StatefulForm>
        </Section>
      ) : null}

      {isAdmin ? (
        <details className="rounded-app border-2 border-kit-orange bg-paper px-4 py-3">
          <summary className="cursor-pointer text-[15px] font-bold text-kit-orange">Remove {child.firstName} from the club</summary>
          <form action={removeChild} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="child" value={child.id} />
            <p className="text-[15px] leading-[22px]">
              This deletes {child.firstName}&apos;s record, attendance and answers. Parents with no other children at the club are removed too. It
              can&apos;t be undone.
            </p>
            <label className="flex min-h-11 items-center gap-3 text-[15px] font-bold">
              <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 accent-[var(--kit-orange)]" />
              Yes, remove {child.firstName}
            </label>
            <button type="submit" className="btn-chunky btn-paper self-start">
              Remove
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  inputMode,
  prefix = "child",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  inputMode?: "numeric" | "email" | "tel";
  prefix?: string;
}) {
  const id = `${prefix}-${name}`;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} name={name} type={type} inputMode={inputMode} defaultValue={defaultValue} className="field" />
    </div>
  );
}

function GuardianFields({
  prefix,
  first,
  last,
  email,
  phone,
}: {
  prefix: string;
  first?: string;
  last?: string;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field prefix={prefix} label="First name" name="firstName" defaultValue={first} />
      <Field prefix={prefix} label="Last name" name="lastName" defaultValue={last} />
      <Field prefix={prefix} label="Email" name="email" type="email" inputMode="email" defaultValue={email ?? ""} />
      <Field prefix={prefix} label="Phone" name="phone" type="tel" inputMode="tel" defaultValue={phone ?? ""} />
    </div>
  );
}
