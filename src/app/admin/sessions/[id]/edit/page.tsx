import type { Metadata } from "next";
import Link from "next/link";
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
import { MediaPicker } from "@/components/media/MediaPicker";
import { loadMediaFor } from "@/lib/media/data";
import { PHOTO_CONSENT_HINT } from "@/lib/media/limits";

export const metadata: Metadata = { title: "Edit session" };

// Change a session's details. Admins any session; a group coach only sessions whose groups are all theirs (404 otherwise).
export default async function EditSessionPage({ params }: PageProps<"/admin/sessions/[id]/edit">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const found = await asUser(user.id, async (tx) => {
    const s = await loadAdminSession(tx, id, coachLimit(user.staff));
    return s ? { session: s, media: (await loadMediaFor(tx, "session", [id])).get(id) ?? [] } : null;
  });
  if (!found) notFound();
  const { session, media } = found;

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
          <MediaPicker initial={media} hint={`Parents see these with the session's details. ${PHOTO_CONSENT_HINT}`} />
          {session.picked ? (
            <p className="text-[13px] text-ink-muted">
              If you take a group off, its children come out of the squad. Answers stay when you change the date or time.
            </p>
          ) : (
            <p className="text-[13px] text-ink-muted">Answers stay when you change the date or time.</p>
          )}
          {/* An explicit choice, no default (admin UX review, Oct 2026): a moved day, time or place should reach the families,
              and answers already given stay, so they need to know. */}
          <fieldset className="flex flex-col gap-1">
            <legend className="field-label">Tell the families?</legend>
            <label className="flex min-h-12 items-center gap-3 text-[15px]">
              <input type="radio" name="notify" value="on" required className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
              <span>
                <b>Yes, tell them</b> in club news, by app notification and email straight away. Do this if the day, time or place changed: their
                Coming / Not coming answers stay as they are.
              </span>
            </label>
            <label className="flex min-h-12 items-center gap-3 text-[15px]">
              <input type="radio" name="notify" value="off" className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
              <span>
                <b>No</b>, it&apos;s a small fix (a typo, a note)
              </span>
            </label>
          </fieldset>
        </StatefulForm>
      </Section>
      {/* Deleting sits here, away from the everyday Edit and Cancel on the list. Never once anyone is checked in. */}
      {session.attended === 0 ? (
        <Link href={`/admin/sessions/${session.id}/delete`} className="inline-flex min-h-12 items-center self-start text-[15px] font-bold text-ink-muted underline">
          Delete this session
        </Link>
      ) : null}
    </div>
  );
}
