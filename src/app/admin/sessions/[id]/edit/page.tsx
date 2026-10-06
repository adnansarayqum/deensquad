import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Section } from "@/components/admin/bits";
import { SessionFields, londonDateInput, londonTimeInput } from "@/components/admin/SessionFields";
import { SessionHeader } from "@/components/admin/SessionHeader";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { updateSession } from "@/lib/admin/actions";
import { loadAdminSession } from "@/lib/admin/data";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Edit session" };

// Change a session's details. Admins any session; a group coach only sessions whose groups are all theirs (404 otherwise).
export default async function EditSessionPage({ params }: PageProps<"/admin/sessions/[id]/edit">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await asUser(user.id, (tx) => loadAdminSession(tx, id, coachLimit(user.staff)));
  if (!session) notFound();

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <SessionHeader session={session} heading={`Edit ${session.title}`} />
      <Section title="Details">
        <StatefulForm action={updateSession} submitLabel="Save changes">
          <input type="hidden" name="id" value={session.id} />
          <SessionFields
            groups={staffGroups(user.staff)}
            defaults={{
              ...session,
              date: londonDateInput(session.startsAt),
              start: londonTimeInput(session.startsAt),
              end: londonTimeInput(session.endsAt),
              groups: session.ageGroups,
            }}
          />
          {session.picked ? (
            <p className="text-[13px] text-ink-muted">
              If you take a group off, its children come out of the squad. Answers stay when you change the date or time.
            </p>
          ) : (
            <p className="text-[13px] text-ink-muted">Answers stay when you change the date or time.</p>
          )}
          <label className="flex min-h-12 items-center gap-3 text-[15px]">
            <input type="checkbox" name="notify" className="h-5 w-5 accent-[var(--grass)]" />
            <span>
              <b>Tell the families about this change</b> in club news, by app notification and email straight away
            </span>
          </label>
        </StatefulForm>
      </Section>
    </div>
  );
}
