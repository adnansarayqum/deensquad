import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { loadMessageChild } from "@/lib/messages/data";
import { loadNewsChildren } from "@/lib/admin/news";
import { matchesName } from "@/lib/search";
import type { AgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Message a family" };

/** New chat: choose a child, then their family's chat opens (`?child=`: straight there). */
export default async function NewStaffMessagePage({ searchParams }: PageProps<"/admin/messages/new">) {
  const user = await requireStaff();
  const { child: childParam, q } = await searchParams;
  if (childParam === undefined) return <ChooseChild userId={user.id} mine={coachLimit(user.staff)} q={typeof q === "string" ? q : ""} />;
  if (typeof childParam !== "string" || !UUID.test(childParam)) notFound();
  // A group coach only for children in their own groups (a 404 otherwise, as the child's page is). The family has
  // one chat: open it, with the box to write at the foot.
  const child = await asUser(user.id, (tx) => loadMessageChild(tx, childParam, coachLimit(user.staff)));
  if (!child) notFound();
  redirect(`/admin/messages/family/${child.id}`);
}

/** New message from the inbox: find the child first (a group coach sees only their groups' children). */
async function ChooseChild({ userId, mine, q }: { userId: string; mine: readonly AgeGroup[] | null; q: string }) {
  const children = await asUser(userId, (tx) => loadNewsChildren(tx, mine));
  const shown = q.trim() ? children.filter((c) => matchesName(q, c.firstName, c.lastName)) : children;
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin/messages", label: "Inbox" }} title="New chat" subtitle="Which child is it about? Their family's chat opens." />
      <form className="flex gap-2" role="search">
        <label htmlFor="child-search" className="sr-only">
          Find a child
        </label>
        <input id="child-search" name="q" defaultValue={q} placeholder="Find a child: first name or initial" className="field flex-1" autoFocus />
        <button type="submit" className="btn-chunky btn-paper">
          Find
        </button>
      </form>
      <ul className="flex flex-col divide-y divide-line rounded-app border border-line bg-paper">
        {shown.length === 0 ? <li className="p-4 text-[15px] text-ink-muted">No child by that name.</li> : null}
        {shown.slice(0, 100).map((c) => (
          <li key={c.id}>
            <Link href={`/admin/messages/new?child=${c.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-[15px] font-bold">
              <span>
                {c.firstName} {c.lastName}
              </span>
              <Pill tone="neutral">{c.ageGroup}</Pill>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
