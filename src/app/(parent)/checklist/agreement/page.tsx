import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { AgreementForm } from "@/components/AgreementForm";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { asUser } from "@/lib/db";
import { CONTRACT } from "@/lib/documents/contract";
import { getChild } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Club contract" };

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

function Section({ heading, points }: { heading: string; points: readonly string[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[17px] font-extrabold">{heading}</h2>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[22px]">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function AgreementPage({ searchParams }: PageProps<"/checklist/agreement">) {
  const { child, userId, family } = await getChild((await searchParams).child);
  if (!child) redirect("/checklist");
  const [[signed], [me]] = await asUser(userId, (tx) =>
    Promise.all([
      tx.query<{ parent_name: string; signed_at: Date }>(`select parent_name, signed_at from agreements where player_id = $1 and document = $2`, [
        child.id,
        CONTRACT.id,
      ]),
      tx.query<{ name: string }>(`select first_name || ' ' || last_name as name from guardians where id = $1`, [family.guardian.id]),
    ]),
  );

  return (
    <>
      <BackHeader back="/checklist" backLabel="Checklist" title="Club contract">
        {CONTRACT.title} for {child.firstName}, season {CONTRACT.season}.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <Card className="flex flex-col gap-5 p-4">
          <p className="text-[15px] leading-[22px]">{CONTRACT.intro}</p>
          <Section {...CONTRACT.player} />
          <Section {...CONTRACT.parent} />
          <Section {...CONTRACT.academy} />
          <p className="text-sm text-ink-muted">
            Signed for the academy by {CONTRACT.academy.signedBy}. {CONTRACT.validity}
          </p>
        </Card>
        {signed ? (
          <p role="status" className="flex items-center gap-3 rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
            <Check aria-hidden size={20} strokeWidth={3} />
            Signed by {signed.parent_name} on {date.format(new Date(signed.signed_at))}.
          </p>
        ) : (
          <AgreementForm
            childId={child.id}
            childName={child.firstName}
            parentName={me?.name ?? ""}
          />
        )}
      </main>
    </>
  );
}
