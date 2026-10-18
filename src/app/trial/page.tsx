import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { TrialForm } from "@/components/trials/TrialForm";
import { GROUP_LABELS } from "@/lib/auth/registration";
import { privacyUrl } from "@/lib/config";
import { clock, shortDay } from "@/lib/dates";
import { asSystem } from "@/lib/db";
import { AGE_GROUPS } from "@/lib/domain";
import { poundsText, sessionFeePence } from "@/lib/settings";
import { loadTrialSessions } from "@/lib/trials/data";

export const metadata: Metadata = { title: "Book a trial session" };

/** Public (no sign-in): a family not yet in the club books one paid trial session. Linked from the club's own pages. */
export default async function TrialPage({ searchParams }: PageProps<"/trial">) {
  const params = await searchParams;
  const privacy = privacyUrl();
  if (params.booked) {
    return (
      <AuthShell title="Trial booked" intro="We've emailed you the details.">
        <div className="flex items-start gap-3 rounded-app border-2 border-grass bg-grass-tint p-4 text-ink">
          <CircleCheck aria-hidden size={24} className="mt-0.5 shrink-0 text-grass-text" />
          <p className="text-[15px] leading-[22px]">
            See you there. Pay the session fee by card at the gate, and tell the coach you&apos;re here for a trial. If the email doesn&apos;t arrive, check
            your junk folder.
          </p>
        </div>
        <Link href="/trial" className="text-sm font-bold text-grass-text underline">
          Book a trial for another child
        </Link>
      </AuthShell>
    );
  }
  const { sessions, fee } = await asSystem(async (tx) => ({ sessions: await loadTrialSessions(tx, new Date()), fee: poundsText(await sessionFeePence(tx)) }));
  return (
    <AuthShell title="Book a trial session" intro={`Come and try Deen Squad Football Academy. One trial session per child, ${fee} paid at the gate.`}>
      <TrialForm
        groups={AGE_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] }))}
        sessions={sessions.map((s) => ({
          id: s.id,
          label: `${s.title}, ${shortDay(s.startsAt)} ${clock(s.startsAt)}`,
          detail: [s.venue, s.ageGroups.join(", ")].filter(Boolean).join(" · "),
          groups: s.ageGroups,
        }))}
        fee={fee}
        privacyHref={privacy}
      />
      <p className="text-[15px]">
        Already in the club?{" "}
        <Link href="/sign-in" className="font-bold text-grass-text underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
