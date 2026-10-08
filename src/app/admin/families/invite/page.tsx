import type { Metadata } from "next";
import Link from "next/link";
import { FamiliesFilterFields } from "@/components/admin/FamiliesFilterFields";
import { inviteParents } from "@/lib/admin/actions";
import { countUninvited } from "@/lib/admin/data";
import { PageHeader } from "@/components/admin/bits";
import { familiesFilter, familiesHref, familiesScope } from "@/lib/admin/families-link";
import { NEEDS } from "@/lib/admin/needs";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { AGE_GROUPS } from "@/lib/domain";

export const metadata: Metadata = { title: "Email invites" };

// The step between "Email invites" on Families and sending: says how many parents (of the children in the
// list as filtered) will be emailed, and sends only on "Send invites". A plain form, so it works without JavaScript.
export default async function InviteConfirmPage({ searchParams }: PageProps<"/admin/families/invite">) {
  const user = await requireAdmin();
  const filter = familiesFilter(await searchParams, AGE_GROUPS);
  const { group, need, q } = filter;
  const count = await asUser(user.id, (tx) => countUninvited(tx, { group, need, search: q || null }));
  const back = familiesHref(filter);
  const scope = familiesScope(filter);
  const whole = !group && !need && !q;
  const parents = `${count} ${count === 1 ? "parent" : "parents"}`;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      {count === 0 ? (
        <>
          <PageHeader back={{ href: back, label: "Families" }} title="No one to invite" />
          <p className="text-[15px]">Every parent {scope} has already had an invite or signed in.</p>
        </>
      ) : (
        <>
          <PageHeader back={{ href: back, label: "Families" }} title={whole ? `Email all ${parents} in the club?` : `Email ${parents} ${scope}?`} />
          {need || q ? (
            <p className="text-[15px] text-ink-muted">
              The list: {[group, need ? NEEDS[need].label.toLowerCase() : null, q ? `matching “${q}”` : null].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <p className="text-[15px]">
            Each gets an email with a sign-in link that works for 7 days. Parents who have already had an invite or signed in aren&apos;t emailed
            again.
          </p>
          <form action={inviteParents} className="flex flex-wrap items-center gap-3">
            <FamiliesFilterFields filter={filter} />
            <input type="hidden" name="confirm" value="yes" />
            <button type="submit" className="btn-chunky btn-grass">
              Send invites
            </button>
            <Link href={back} className="btn-chunky btn-paper">
              Cancel
            </Link>
          </form>
        </>
      )}
    </div>
  );
}
