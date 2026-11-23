import Link from "next/link";
import { SponsorLogo } from "@/components/SponsorLogo";
import { requireParent } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { loadSponsors, sponsorIcon, sponsorOfTheWeek } from "@/lib/sponsors/data";
import { countSponsorViews, type SponsorPlace } from "@/lib/sponsors/views";

/**
 * One quiet line naming this week's sponsor ("Supported by Banglatown Cash & Carry"), linking to the sponsors page.
 * Sponsors take a week each. Nothing while the club has none. Each showing to a parent adds one to that sponsor's
 * total for the place; staff looking at the parent side aren't counted.
 */
export async function SupportedBy({ place, label = "Supported by", from, className = "" }: { place: SponsorPlace; label?: string; from: string; className?: string }) {
  const user = await requireParent();
  const sponsor = sponsorOfTheWeek(await asUser(user.id, (tx) => loadSponsors(tx)), new Date());
  if (!sponsor) return null;
  if (!user.staff) countSponsorViews([sponsor.id], place);
  const icon = sponsorIcon(sponsor);
  return (
    <Link href={`/sponsors?from=${from}`} className={`flex min-h-12 items-center gap-2.5 text-ink ${className}`}>
      <SponsorLogo name={sponsor.name} fileId={icon.fileId} bg={icon.bg} size={32} />
      <span className="min-w-0 text-[14px] leading-5 text-ink-muted">
        {label} <span className="font-bold text-ink">{sponsor.name}</span>
      </span>
    </Link>
  );
}
