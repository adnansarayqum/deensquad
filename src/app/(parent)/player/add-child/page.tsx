import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { AddChildForm } from "@/components/ProfileForms";
import { Card } from "@/components/ui";
import { GROUP_LABELS } from "@/lib/auth/registration";
import { londonIsoDate } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { AGE_GROUPS } from "@/lib/domain";
import { getFamily } from "@/lib/parent/load";
import { loadMyDetails } from "@/lib/parent/profile";

export const metadata: Metadata = { title: "Add a child" };

/** Player → Add a child: another child for this parent's account, in the group the parent thinks fits; the club checks. */
export default async function AddChildPage() {
  const { user } = await getFamily();
  const details = await asUser(user.id, loadMyDetails);
  if (!details) notFound();

  return (
    <>
      <BackHeader back="/player" backLabel="Back" title="Add a child">
        Another child of yours who plays at the club. They&apos;re added to your account straight away.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <Card className="p-4">
          <AddChildForm groups={AGE_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] }))} lastName={details.lastName} today={londonIsoDate(new Date())} />
        </Card>
        <p className="px-1 text-sm leading-5 text-ink-muted">Other parents can be added by the club.</p>
      </main>
    </>
  );
}
