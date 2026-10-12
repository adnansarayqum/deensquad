import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MedicalDetails } from "@/components/admin/MedicalDetails";
import { PageHeader, Section } from "@/components/admin/bits";
import { requireStaff } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { groupPlural, type AgeGroup } from "@/lib/domain";
import { loadMedicalForStaff } from "@/lib/medical/data";
import { backPath } from "@/lib/viewer";

export const metadata: Metadata = { title: "Medical info" };

/**
 * A child's medical and additional needs, opened from the register's "Medical info" link: on a page of its own, so
 * the details are never on the list at the gate. Admins and the coaches of the child's group only (`can_see_medical`);
 * anyone else gets a 404, as if there were nothing.
 */
export default async function CoachMedicalPage({ params, searchParams }: PageProps<"/coach/child/[id]/medical">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const from = backPath((await searchParams).from, "/coach");
  const back = from.startsWith("/coach") ? from : "/coach";
  const found = await asUser(user.id, async (tx) => {
    const [child] = await tx.query<{ first_name: string; last_name: string; age_group: AgeGroup; allowed: boolean }>(
      `select first_name, last_name, age_group::text as age_group, can_see_medical(id) as allowed from players where id = $1`,
      [id],
    );
    if (!child?.allowed) return null;
    return { child, medical: await loadMedicalForStaff(tx, id) };
  });
  if (!found) notFound();
  const { child, medical } = found;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: back, label: "Register" }}
        title={`${child.first_name} ${child.last_name[0] ?? ""}.`}
        subtitle={`${groupPlural(child.age_group)} · medical and additional needs`}
      />
      <Section title="From the parents">
        <MedicalDetails medical={medical} firstName={child.first_name} />
      </Section>
      <p className="text-sm leading-5 text-ink-muted">
        Only the club&apos;s admins and the coaches of the {groupPlural(child.age_group)} can see this. Please keep it to yourself.
      </p>
    </div>
  );
}
