import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { AppHeader, Card } from "@/components/ui";
import { confirmPaymentPlan } from "@/lib/actions";
import { getParentView } from "@/lib/data";

export const metadata: Metadata = { title: "Set up payments" };

// The club's TeamFeePay sign-up link. Set NEXT_PUBLIC_TEAMFEEPAY_URL in the environment once the club shares it.
const teamFeePayUrl = process.env.NEXT_PUBLIC_TEAMFEEPAY_URL;

export default async function PaymentPage() {
  const view = await getParentView();
  const child = view.player.firstName;
  return (
    <>
      <AppHeader>
        <Link href="/checklist" className="inline-flex items-center gap-1 self-start text-sm font-bold text-on-pitch-muted">
          <ChevronLeft aria-hidden size={18} />
          Checklist
        </Link>
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">Set up payments</h1>
        <p className="text-sm text-on-pitch-muted">The club takes the monthly fee through TeamFeePay. It takes about two minutes.</p>
      </AppHeader>

      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-extrabold">What happens</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-[22px]">
            <li>Open TeamFeePay and choose {child}&apos;s age group.</li>
            <li>Set up the monthly plan with your card or Direct Debit.</li>
            <li>Come back here and tap &ldquo;I&apos;ve set it up&rdquo;. The club checks it against TeamFeePay.</li>
          </ol>
        </Card>

        {teamFeePayUrl ? (
          <a href={teamFeePayUrl} target="_blank" rel="noopener noreferrer" className="btn-chunky btn-grass">
            Open TeamFeePay
            <ExternalLink aria-hidden size={18} />
          </a>
        ) : (
          <p className="rounded-app bg-orange-tint p-3.5 text-sm text-ink">
            The club&apos;s TeamFeePay link isn&apos;t set yet. Ask the club on WhatsApp for it.
          </p>
        )}

        <form action={confirmPaymentPlan}>
          <button type="submit" className="btn-chunky btn-paper w-full">
            I&apos;ve set it up
          </button>
        </form>
      </main>
    </>
  );
}
