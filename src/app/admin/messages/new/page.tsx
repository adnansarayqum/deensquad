import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/bits";
import { MessageForm } from "@/components/messages/MessageForm";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { sendStaffMessage } from "@/lib/messages/actions";
import { loadMessageChild } from "@/lib/messages/data";
import { SUBJECT_MAX } from "@/lib/messages/limits";
import { loadNewsChildren } from "@/lib/admin/news";
import { matchesName } from "@/lib/search";
import type { AgeGroup } from "@/lib/domain";

export const metadata: Metadata = { title: "Message a family" };

/** "Message this family" from a child's page: a new conversation with the child's parents, addressed to you. */
export default async function NewStaffMessagePage({ searchParams }: PageProps<"/admin/messages/new">) {
  const user = await requireStaff();
  const { child: childParam, q } = await searchParams;
  if (childParam === undefined) return <ChooseChild userId={user.id} mine={coachLimit(user.staff)} q={typeof q === "string" ? q : ""} />;
  if (typeof childParam !== "string" || !UUID.test(childParam)) notFound();
  // A group coach only for children in their own groups (the page 404s otherwise, as the child's page does).
  const child = await asUser(user.id, (tx) => loadMessageChild(tx, childParam, coachLimit(user.staff)));
  if (!child) notFound();

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: `/admin/families/${child.id}`, label: `${child.firstName} ${child.lastName}` }} title="Message this family">
        <p className="flex flex-wrap items-center gap-2 text-[15px]">
          About {child.firstName} {child.lastName} <Pill tone="neutral">{child.ageGroup}</Pill>
        </p>
      </PageHeader>
      <Section title={child.parents.length ? `To ${child.parents.join(" and ")}` : "No parent linked yet"}>
        <MessageForm action={sendStaffMessage} hidden={{ child: child.id }} submitLabel="Send to the family" media>
          <div>
            <label htmlFor="message-subject" className="field-label">
              Subject (optional)
            </label>
            <input id="message-subject" name="subject" maxLength={SUBJECT_MAX} className="field" />
          </div>
        </MessageForm>
        <p className="text-[13px] text-ink-muted">
          Every parent of {child.firstName} sees it in the app (with a notification, or an email saying there&apos;s a message). Their replies come to you; {child.firstName}&apos;s coaches and the club&apos;s admins can read the conversation too.
        </p>
      </Section>
    </div>
  );
}

/** New message from the inbox: find the child first (a group coach sees only their groups' children). */
async function ChooseChild({ userId, mine, q }: { userId: string; mine: readonly AgeGroup[] | null; q: string }) {
  const children = await asUser(userId, (tx) => loadNewsChildren(tx, mine));
  const shown = q.trim() ? children.filter((c) => matchesName(q, c.firstName, c.lastName)) : children;
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin/messages", label: "Messages" }} title="New message" subtitle="Which child is it about? Their parents get it." />
      <form className="flex gap-2" role="search">
        <label htmlFor="child-search" className="sr-only">
          Find a child
        </label>
        <input id="child-search" name="q" defaultValue={q} placeholder="Find a child: first name or initial" className="field flex-1" autoFocus />
        <button type="submit" className="btn-chunky btn-paper">
          Find
        </button>
      </form>
      <ul className="flex flex-col divide-y-2 divide-line rounded-app border-2 border-line bg-paper">
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
