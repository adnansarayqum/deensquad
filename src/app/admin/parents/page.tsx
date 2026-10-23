import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { inviteParentFromList } from "@/lib/admin/actions";
import { loadParentsNotIn, type ParentNotIn } from "@/lib/admin/parents";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { tidyName } from "@/lib/validate";

export const metadata: Metadata = { title: "Parents not on the app" };

/**
 * The parents behind the overview's "6 not yet", by name: invited but not signed in, then not invited. The Families
 * list goes by child, so a parent whose partner has signed in never showed there; this lists every one of them.
 */
export default async function ParentsNotInPage({ searchParams }: PageProps<"/admin/parents">) {
  const user = await requireStaff();
  const flags = await searchParams;
  const isAdmin = user.staff?.role === "admin";
  const parents = await asUser(user.id, (tx) => loadParentsNotIn(tx, coachLimit(user.staff!)));
  const invited = parents.filter((p) => p.invitedAt);
  const notInvited = parents.filter((p) => !p.invitedAt);

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: "/admin", label: "Overview" }}
        title="Parents not on the app"
        subtitle={parents.length === 0 ? "Every parent has signed in." : `${parents.length} ${parents.length === 1 ? "parent hasn't" : "parents haven't"} signed in yet.`}
      >
        {flags.invited === "1" ? <Notice>Invite sent.</Notice> : null}
        {flags.invite === "failed" ? <Notice tone="action">The invite wasn&apos;t sent. Try again later.</Notice> : null}
        {flags.invite === "no-email" ? <Notice tone="action">Email isn&apos;t set up yet. Add RESEND_API_KEY in Railway.</Notice> : null}
        {flags.invite === "no-url" ? <Notice tone="action">Set APP_URL in Railway so invite links point at the app.</Notice> : null}
      </PageHeader>

      <ParentList id="invited" title="Invited, not signed in yet" list={invited} canInvite={isAdmin} again />
      <ParentList id="not-invited" title="Not invited yet" list={notInvited} canInvite={isAdmin} />
    </div>
  );
}

function ParentList({ id, title, list, canInvite, again = false }: { id: string; title: string; list: ParentNotIn[]; canInvite: boolean; again?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="rounded-app border-2 border-line bg-paper p-4">
      <h2 id={`${id}-heading`} className="text-[17px] font-extrabold">
        {title} ({list.length})
      </h2>
      {list.length === 0 ? (
        <p className="mt-1 text-[15px] text-ink-muted">Nobody.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {list.map((p) => {
            const name = tidyName(`${p.firstName} ${p.lastName}`.trim());
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold break-words">{name}</p>
                  <p className="text-[13px] break-all text-ink-muted">
                    {p.email ?? "No email on file"}
                    {p.invitedAt ? ` · invited ${shortDay(p.invitedAt)}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className="text-ink-muted">Parent of</span>
                    {p.children.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1">
                        <Link href={`/admin/families/${c.id}`} className="inline-flex min-h-12 items-center font-bold underline">
                          {tidyName(`${c.firstName} ${c.lastName}`)}
                        </Link>
                        <Pill tone="neutral">{c.group}</Pill>
                      </span>
                    ))}
                  </p>
                </div>
                {canInvite && p.email ? (
                  <form action={inviteParentFromList}>
                    <input type="hidden" name="guardian" value={p.id} />
                    <button type="submit" aria-label={`${again ? "Send invite again to" : "Send invite to"} ${name}`} className="btn-chunky btn-paper btn-small min-h-12">
                      {again ? "Send again" : "Send invite"}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
