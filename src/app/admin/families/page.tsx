import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Upload } from "lucide-react";
import { AdminTitle, Notice } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { inviteParents } from "@/lib/admin/actions";
import { loadFamilies, loadOverview } from "@/lib/admin/data";
import { requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { isAgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Families" };

export default async function FamiliesPage({ searchParams }: PageProps<"/admin/families">) {
  const user = await requireStaff();
  const params = await searchParams;
  const mine = staffGroups(user.staff);
  const group = isAgeGroup(params.group) && mine.includes(params.group) ? params.group : null;
  const [families, overview] = await asUser(user.id, (tx) => Promise.all([loadFamilies(tx, group, mine), loadOverview(tx)]));
  const isAdmin = user.staff.role === "admin";

  return (
    <>
      <AdminTitle
        action={
          isAdmin ? (
            <Link href="/admin/families/import" className="btn-chunky btn-paper btn-small">
              <Upload aria-hidden size={16} />
              Import families
            </Link>
          ) : null
        }
      >
        Families
      </AdminTitle>

      {params.invited && params.notSent ? (
        <Notice tone="action">{`Sent to ${params.invited}. ${params.notSent} not sent – try again later.`}</Notice>
      ) : params.invited ? (
        <Notice>{params.invited === "0" ? "Everyone has already been invited." : `Invites sent to ${params.invited} parents.`}</Notice>
      ) : null}
      {params.invite === "no-email" ? <Notice tone="action">Email isn&apos;t set up yet. Add RESEND_API_KEY in Railway, then send the invites.</Notice> : null}
      {params.invite === "no-url" ? <Notice tone="action">Set APP_URL in Railway to the app&apos;s web address, then send the invites.</Notice> : null}
      {params.removed ? <Notice>Removed.</Notice> : null}

      {isAdmin && overview.notInvited > 0 ? (
        <form action={inviteParents} className="flex flex-wrap items-center justify-between gap-3 rounded-app bg-gold-tint px-4 py-3">
          <p className="text-[15px]">
            <b>{overview.notInvited}</b> {overview.notInvited === 1 ? "parent hasn't" : "parents haven't"} had an invite yet.
          </p>
          <button type="submit" className="btn-chunky btn-grass btn-small">
            Email invites
          </button>
        </form>
      ) : null}

      <nav aria-label="Age groups" className="flex flex-wrap gap-2">
        {[null, ...mine].map((g) => (
          <Link
            key={g ?? "all"}
            href={g ? `/admin/families?group=${g}` : "/admin/families"}
            aria-current={g === group ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 text-sm font-extrabold ${
              g === group ? "border-grass bg-grass-tint text-grass-text" : "border-line bg-paper text-ink"
            }`}
          >
            {g ?? "All"}
          </Link>
        ))}
      </nav>

      {families.length === 0 ? (
        <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px]">
          {group ? `No players in the ${group}s.` : "No families yet. Import them from a spreadsheet to get started."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {families.map((f) => {
            const parents = f.guardians.map((g) => g.name).join(", ");
            const invited = f.guardians.some((g) => g.invited);
            return (
              <li key={f.id}>
                <Link href={`/admin/families/${f.id}`} className="flex items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-pitch font-display text-[20px] text-on-pitch">
                    {f.shirtNumber ?? f.firstName[0]}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[15px] font-bold">
                      {f.firstName} {f.lastName} <span className="font-normal text-ink-muted">· {f.ageGroup}</span>
                    </span>
                    <span className="truncate text-[13px] text-ink-muted">{parents || "No parent linked"}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {f.inApp ? <Pill tone="done">In app</Pill> : invited ? <Pill tone="gold">Invited</Pill> : <Pill tone="neutral">Not invited</Pill>}
                      {f.payment === "missing" || f.payment === "overdue" ? (
                        <Pill tone="action">{f.payment === "overdue" ? "Payment overdue" : "No payment plan"}</Pill>
                      ) : f.payment === "self_reported" ? (
                        <Pill tone="gold">Payment to check</Pill>
                      ) : null}
                      {f.consent === null ? <Pill tone="action">No photo answer</Pill> : null}
                      {f.contacts === 0 ? <Pill tone="action">No emergency contact</Pill> : null}
                      {!f.agreed ? <Pill tone="action">Contract not signed</Pill> : null}
                    </span>
                  </span>
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
