import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/bits";
import { inviteParentFromList } from "@/lib/admin/actions";
import { loadParentsNotIn, type ParentNotIn } from "@/lib/admin/parents";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { tidyName } from "@/lib/validate";

export const metadata: Metadata = { title: "Parents not on the app yet" };

/**
 * The parents behind the overview's "6 not yet", by name. The Families list goes by child, so a parent whose partner
 * has signed in never showed there; this lists every one of them, in plain words: who they are, whose parent, whether
 * their partner is already on the app, and whether an invite has gone.
 */
export default async function ParentsNotInPage({ searchParams }: PageProps<"/admin/parents">) {
  const user = await requireStaff();
  const flags = await searchParams;
  const isAdmin = user.staff?.role === "admin";
  const parents = await asUser(user.id, (tx) => loadParentsNotIn(tx, coachLimit(user.staff!)));
  const notInvited = parents.filter((p) => !p.invitedAt);
  const invited = parents.filter((p) => p.invitedAt);
  const n = parents.length;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin", label: "Overview" }} title="Parents not on the app yet">
        {flags.invited === "1" ? <Notice>Invite sent.</Notice> : null}
        {flags.invite === "failed" ? <Notice tone="action">The invite wasn&apos;t sent. Try again later.</Notice> : null}
        {flags.invite === "no-email" ? <Notice tone="action">Email isn&apos;t set up yet. Add RESEND_API_KEY in Railway.</Notice> : null}
        {flags.invite === "no-url" ? <Notice tone="action">Set APP_URL in Railway so invite links point at the app.</Notice> : null}
      </PageHeader>

      <p className="text-[17px] leading-[26px]">
        {n === 0 ? (
          "Every parent has signed in to the app."
        ) : (
          <>
            <strong>{n === 1 ? "1 parent hasn't" : `${n} parents haven't`} signed in yet</strong>, so they don't get club news,
            session questions or messages in the app. Their children are still in the club.
          </>
        )}
      </p>

      <ParentList
        id="not-invited"
        title={`No invite sent yet (${notInvited.length})`}
        hint={isAdmin && notInvited.length > 0 ? "Tap Send invite to email them a link to join." : null}
        list={notInvited}
        canInvite={isAdmin}
      />
      <ParentList
        id="invited"
        title={`Invited, but not signed in yet (${invited.length})`}
        hint={invited.length > 0 ? "They have an email from the club. Send it again or remind them at training." : null}
        list={invited}
        canInvite={isAdmin}
        again
      />
    </div>
  );
}

const names = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function ParentList({
  id,
  title,
  hint,
  list,
  canInvite,
  again = false,
}: {
  id: string;
  title: string;
  hint: string | null;
  list: ParentNotIn[];
  canInvite: boolean;
  again?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="rounded-app border-2 border-line bg-paper p-4">
      <h2 id={`${id}-heading`} className="text-[17px] font-extrabold">
        {title}
      </h2>
      {hint ? <p className="text-[15px] text-ink-muted">{hint}</p> : null}
      {list.length === 0 ? (
        <p className="mt-1 text-[15px] text-ink-muted">Nobody.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {list.map((p) => {
            const name = tidyName(`${p.firstName} ${p.lastName}`.trim());
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-bold break-words">{name}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[15px]">
                    <span>Parent of</span>
                    {p.children.map((c, i) => (
                      <span key={c.id} className="inline-flex items-center">
                        <Link href={`/admin/families/${c.id}`} className="inline-flex min-h-12 items-center font-bold underline">
                          {tidyName(c.firstName)} ({c.group})
                        </Link>
                        {i < p.children.length - 2 ? "," : i === p.children.length - 2 ? <span className="pl-1.5">and</span> : null}
                      </span>
                    ))}
                  </p>
                  {p.partnersOnApp.length > 0 ? (
                    <p className="text-[15px] font-bold text-grass-text">
                      {names(p.partnersOnApp.map(tidyName))} {p.partnersOnApp.length === 1 ? "is" : "are"} already on the app for this family.
                    </p>
                  ) : null}
                  <p className="text-[13px] break-all text-ink-muted">
                    {p.email ?? "No email on file"}
                    {p.invitedAt ? ` · invite sent ${shortDay(p.invitedAt)}` : ""}
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
