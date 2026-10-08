import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ChildAvatar } from "@/components/ChildAvatar";
import { ChildPhotoForm } from "@/components/ChildPhotoForm";
import { ChildDetailsForm } from "@/components/ProfileForms";
import { Card } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { londonIsoDate } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { groupPlural } from "@/lib/domain";
import { getFamily } from "@/lib/parent/load";
import { loadMyChild } from "@/lib/parent/profile";

export const metadata: Metadata = { title: "Child's details" };

/** Player → a child's details: name and date of birth, which the parent keeps; the group, which the club sets. */
export default async function ChildDetailsPage({ params }: PageProps<"/player/child/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { user } = await getFamily();
  // Only the parent's own children: anyone else's id (guessed or mistyped) is a 404, never a page.
  const child = await asUser(user.id, (tx) => loadMyChild(tx, id));
  if (!child) notFound();
  const back = `/player?child=${child.id}`;

  return (
    <>
      <BackHeader back={back} backLabel="Back" title={`${child.firstName}'s details`}>
        Keep {child.firstName}&apos;s name and date of birth right. The club takes care of the rest.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <Card className="p-4">
          <ChildDetailsForm child={child} today={londonIsoDate(new Date())} />
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-extrabold">Photo for the coaches</h2>
          {child.photoConsent === true ? (
            <ChildPhotoForm child={child} />
          ) : (
            <div className="flex items-center gap-4">
              <ChildAvatar photoId={null} firstName={child.firstName} lastName={child.lastName} size={96} />
              <Link href={`/checklist/consent?child=${child.id}`} className="inline-flex min-h-12 items-center text-[15px] font-bold text-grass-text underline">
                Turn on photo consent to add a photo
              </Link>
            </div>
          )}
          <p className="text-sm leading-5 text-ink-muted">
            Only the club&apos;s coaches see this, to learn names. It&apos;s deleted if you turn off photo consent or remove the photo.
          </p>
        </Card>

        <Card className="flex flex-col gap-1 p-4">
          <h2 className="text-base font-extrabold">Group</h2>
          <p className="text-[15px] leading-[22px]">{groupPlural(child.ageGroup)}</p>
          <p className="text-sm leading-5 text-ink-muted">Groups are set by the club. Ask a coach if it looks wrong.</p>
        </Card>

        <Card className="flex flex-col p-1">
          <Link href={`/checklist/contacts?child=${child.id}`} className="flex min-h-12 items-center justify-between gap-3 px-3 text-[15px] font-bold">
            Emergency contacts for {child.firstName}
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
          <Link
            href={`/checklist/consent?child=${child.id}`}
            className="flex min-h-12 items-center justify-between gap-3 border-t-2 border-line px-3 text-[15px] font-bold"
          >
            Photo consent for {child.firstName}
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
        </Card>

        <p className="px-1 text-sm leading-5 text-ink-muted">To remove {child.firstName} from the club, ask the club.</p>
      </main>
    </>
  );
}
