import type { Metadata } from "next";
import { backTarget } from "@/lib/parent/tabs";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { MedicalForm, RemoveMedicalForm } from "@/components/MedicalForm";
import { Card } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { groupPlural } from "@/lib/domain";
import { loadMyChildMedical } from "@/lib/medical/data";
import { getFamily } from "@/lib/parent/load";
import { loadMyChild } from "@/lib/parent/profile";

export const metadata: Metadata = { title: "Medical and additional needs" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/**
 * Player → a child's details → Medical and additional needs: what the coaches should know to look after the child,
 * given with the parent's consent. Seen by the child's own parents, the coaches of the child's group and the admins.
 */
export default async function ChildMedicalPage({ params, searchParams }: PageProps<"/player/child/[id]/medical">) {
  const { id } = await params;
  const { removed, from } = await searchParams;
  if (!UUID.test(id)) notFound();
  const { user } = await getFamily();
  // Only the parent's own children: anyone else's id is a 404, never a page.
  const [child, medical] = await asUser(user.id, (tx) => Promise.all([loadMyChild(tx, id), loadMyChildMedical(tx, id)]));
  if (!child) notFound();
  const name = child.firstName;
  const back = backTarget(from, { href: `/player/child/${child.id}`, label: `${name}'s details` });

  return (
    <>
      <BackHeader back={back.href} backLabel={back.label} title="Medical and additional needs">
        Anything {name}&apos;s coaches should know to look after {name}. Optional: fill in only what helps.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        {removed === "1" && !medical ? (
          <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
            {name}&apos;s medical information is removed.
          </p>
        ) : null}
        <Card className="flex flex-col gap-2 p-4 text-[15px] leading-[22px]">
          <h2 className="text-base font-extrabold">Who sees this</h2>
          <p>
            Only you (and {name}&apos;s other parents in the app), the coaches of the {groupPlural(child.ageGroup)} and the club&apos;s admins. Never other
            parents, and it&apos;s never shown on the register list itself: the coaches tap to read it.
          </p>
          {medical ? <p className="text-sm text-ink-muted">Last saved {day.format(new Date(medical.updatedAt))}.</p> : null}
        </Card>

        <Card className="p-4">
          {/* A fresh form after Remove (a redirect to this page), so the boxes show what's saved: nothing. */}
          <MedicalForm key={removed === "1" ? "removed" : "form"} child={child} medical={medical} />
        </Card>

        {medical ? (
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-base font-extrabold">Remove it</h2>
            <p className="text-[15px] leading-[22px]">This deletes everything above. The coaches won&apos;t see it any more.</p>
            <RemoveMedicalForm child={child} />
          </Card>
        ) : null}

        <p className="px-1 text-sm leading-5 text-ink-muted">
          Tell a coach in person about anything urgent on the day: they may not have read this before the session.
        </p>
      </main>
    </>
  );
}
