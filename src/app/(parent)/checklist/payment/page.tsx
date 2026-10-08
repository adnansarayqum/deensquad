import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Check, ExternalLink, PoundSterling } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { clubFeeText, teamFeePayUrl } from "@/lib/config";
import { reportPaymentSetup } from "@/lib/parent/actions";
import { getPaymentPage } from "@/lib/parent/load";
import { feeLine, joinNames } from "@/lib/parent/views";

export const metadata: Metadata = { title: "Set up payments" };

// One step for the whole family: the monthly plan is set up once on TeamFeePay, so one "I've set it up" covers
// every child whose plan is still missing (or overdue). The club still confirms each child's plan on its own.
export default async function PaymentPage() {
  const { family, payment, needed, overdue } = await getPaymentPage();
  const url = teamFeePayUrl();
  const fee = clubFeeText();
  const names = (children: { firstName: string }[]) => joinNames(children.map((c) => c.firstName));
  const groups = [...new Set(needed.map((c) => c.ageGroup))].join(", ");
  const reported = family.children.filter((c) => payment.get(c.id) === "self_reported");
  const active = family.children.filter((c) => payment.get(c.id) === "active");

  return (
    <>
      <BackHeader back="/checklist" backLabel="Checklist" title="Set up payments">
        {url ? "The club takes the monthly fee through TeamFeePay. It takes about two minutes." : "How the club takes the monthly fee."}
      </BackHeader>

      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <Card className="flex items-start gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-tint text-gold-text">
            <PoundSterling aria-hidden size={22} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-extrabold">What it costs</h2>
            <p className="text-[15px] leading-[22px] whitespace-pre-line">{fee ?? `${feeLine(fee)}.`}</p>
          </div>
        </Card>

        {active.length > 0 ? <Status>Monthly plan active for {names(active)}.</Status> : null}
        {reported.length > 0 ? <Status>You&apos;ve told the club it&apos;s set up for {names(reported)}. The club will confirm.</Status> : null}
        {overdue.length > 0 ? (
          <p className="rounded-app bg-orange-tint p-3.5 text-[15px] text-ink">
            A payment is overdue for {names(overdue)}. Check TeamFeePay, then tell the club below.
          </p>
        ) : null}

        {needed.length === 0 ? null : url ? (
          <>
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-base font-extrabold">What happens</h2>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-[22px]">
                <li>
                  Open TeamFeePay and choose {needed.length > 1 ? "each child's group" : `${needed[0].firstName}'s group`} ({groups}).
                </li>
                <li>Set up the monthly plan with your card or Direct Debit.</li>
                <li>Come back here and tap &ldquo;I&apos;ve set it up&rdquo;. The club checks it against TeamFeePay.</li>
              </ol>
            </Card>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-chunky btn-grass">
              Open TeamFeePay
              <ExternalLink aria-hidden size={18} />
            </a>
            <form action={reportPaymentSetup} className="flex flex-col gap-2">
              {needed.map((c) => (
                <input key={c.id} type="hidden" name="child" value={c.id} />
              ))}
              <button type="submit" className="btn-chunky btn-paper w-full">
                {needed.length > 1 ? "I've set it up" : `I've set it up for ${needed[0].firstName}`}
              </button>
              {needed.length > 1 ? <p className="text-center text-sm font-bold">Covers {names(needed)}</p> : null}
            </form>
          </>
        ) : (
          <p className="rounded-app border-2 border-line bg-paper p-3.5 text-[15px] text-ink">The club will tell you how to pay.</p>
        )}
      </main>
    </>
  );
}

function Status({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
      <Check aria-hidden size={20} strokeWidth={3} className="shrink-0" />
      <span>{children}</span>
    </p>
  );
}
