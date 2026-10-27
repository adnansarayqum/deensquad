import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/bits";
import { TeamFeePayForm } from "@/components/admin/TeamFeePayForm";
import { requireAdmin } from "@/lib/auth/session";
import { shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { lastTeamFeePaySync } from "@/lib/payments/teamfeepay";

export const metadata: Metadata = { title: "Update plans from TeamFeePay" };

export default async function TeamFeePayPage() {
  const user = await requireAdmin();
  const last = await asUser(user.id, lastTeamFeePaySync);
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: "/admin/families", label: "Families" }}
        title="Update plans from TeamFeePay"
        subtitle={last ? `Last updated from TeamFeePay on ${shortDay(last.toISOString())}.` : undefined}
      />
      <Section title="How it works">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-[22px]">
          <li>In TeamFeePay, export your members list as a CSV, with each member&apos;s name, the payer&apos;s email and their status.</li>
          <li>Upload it here. You&apos;ll see every plan that would change, and any row that doesn&apos;t match a child, before anything is saved.</li>
          <li>Active members get a monthly plan, failed or overdue ones show as overdue, and cancelled ones go back to no plan (pay-as-you-go families stay as they are).</li>
        </ol>
      </Section>
      <TeamFeePayForm />
    </div>
  );
}
