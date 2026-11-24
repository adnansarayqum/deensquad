import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { SponsorCard } from "@/components/SponsorLogo";
import { Card } from "@/components/ui";
import { requireParent } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { backTarget } from "@/lib/parent/tabs";
import { SponsorLink } from "@/components/SponsorLink";
import { loadSponsors, sponsorLinkLabel } from "@/lib/sponsors/data";
import { countSponsorViews } from "@/lib/sponsors/views";

export const metadata: Metadata = { title: "Our sponsors" };

export default async function SponsorsPage({ searchParams }: PageProps<"/sponsors">) {
  const back = backTarget((await searchParams).from, { href: "/news", label: "Home" });
  const user = await requireParent();
  const sponsors = await asUser(user.id, (tx) => loadSponsors(tx));
  // A total per sponsor of times this page showed them to a parent; never who.
  if (!user.staff) countSponsorViews(sponsors.map((s) => s.id), "page");
  return (
    <>
      <BackHeader back={back.href} backLabel={back.label} title="Our sponsors">
        These local businesses support the club. Please support them where you can.
      </BackHeader>
      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        {sponsors.length === 0 ? <Card className="p-4 text-[15px]">No sponsors to show yet.</Card> : null}
        {sponsors.map((s) => (
          <Card key={s.id} className="flex flex-col gap-3 p-4">
            {/* The full logo across the card: a wide logo is unreadable on a small square. */}
            <SponsorCard name={s.name} fileId={s.logoFileId} bg={s.logoBg} shape="banner" decorative />
            <div className="min-w-0">
              <h2 className="text-[18px] font-bold break-words">{s.name}</h2>
              {s.sponsorsWhat ? <p className="text-[15px] text-ink-muted">Sponsors the {s.sponsorsWhat}</p> : null}
            </div>
            {s.about ? <p className="text-[16px] leading-6">{s.about}</p> : null}
            {s.offer ? (
              <div className="rounded-xl bg-gold-tint px-3 py-2.5">
                <p className="text-[13px] font-bold text-gold-text">For Deen Squad families</p>
                <p className="text-[16px] font-bold">{s.offer}</p>
                {s.offerHow ? <p className="text-[15px] text-ink-muted">{s.offerHow}</p> : null}
              </div>
            ) : null}
            {s.linkUrl ? (
              <SponsorLink
                id={s.id}
                href={s.linkUrl}
                label={`${sponsorLinkLabel(s.linkUrl)}: ${s.name} (opens outside the app)`}
                className="btn-chunky btn-paper flex min-h-12 items-center justify-center gap-2"
              >
                {sponsorLinkLabel(s.linkUrl)}
                <ExternalLink aria-hidden size={18} />
              </SponsorLink>
            ) : null}
          </Card>
        ))}
      </main>
    </>
  );
}
