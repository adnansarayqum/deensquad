import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Message a family" };

/** "Message this family" from a child's page: a new conversation with the child's parents, addressed to you. */
export default async function NewStaffMessagePage({ searchParams }: PageProps<"/admin/messages/new">) {
  const user = await requireStaff();
  const { child: childParam } = await searchParams;
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
        <MessageForm action={sendStaffMessage} hidden={{ child: child.id }} submitLabel="Send to the family">
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
