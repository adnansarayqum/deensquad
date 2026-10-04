import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { teamFeePayUrl } from "@/lib/config";
import { reportPaymentSetup } from "@/lib/parent/actions";
import { getChild } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Set up payments" };

export default async function PaymentPage({ searchParams }: PageProps<"/checklist/payment">) {
  const { child } = await getChild((await searchParams).child);
  if (!child) redirect("/checklist");
  const url = teamFeePayUrl();

  return (
    <>
      <BackHeader back="/checklist" backLabel="Checklist" title="Set up payments">
        The club takes the monthly fee through TeamFeePay. It takes about two minutes.
      </BackHeader>

      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-extrabold">What happens</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-[22px]">
            <li>Open TeamFeePay and choose {child.firstName}&apos;s age group ({child.ageGroup}).</li>
            <li>Set up the monthly plan with your card or Direct Debit.</li>
            <li>Come back here and tap &ldquo;I&apos;ve set it up&rdquo;. The club checks it against TeamFeePay.</li>
          </ol>
        </Card>

        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-chunky btn-grass">
            Open TeamFeePay
            <ExternalLink aria-hidden size={18} />
          </a>
        ) : (
          <p className="rounded-app bg-orange-tint p-3.5 text-sm text-ink">The club&apos;s TeamFeePay link isn&apos;t set yet. Ask the club for it.</p>
        )}

        <form action={reportPaymentSetup}>
          <input type="hidden" name="child" value={child.id} />
          <button type="submit" className="btn-chunky btn-paper w-full">
            I&apos;ve set it up for {child.firstName}
          </button>
        </form>
      </main>
    </>
  );
}
