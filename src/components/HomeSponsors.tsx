import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SponsorLogo } from "@/components/SponsorLogo";
import { requireParent } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { loadSponsors, sponsorIcon } from "@/lib/sponsors/data";

/**
 * Home's slim one-line link to the sponsors page, shown after the first post (25 Nov 2026: above the news it pushed
 * the club's posts off the first screen): the heading, how many have an offer, and up to five logos.
 * Nothing until there's a sponsor.
 */
export async function HomeSponsors() {
  const user = await requireParent();
  const sponsors = await asUser(user.id, (tx) => loadSponsors(tx));
  if (sponsors.length === 0) return null;
  const offers = sponsors.filter((s) => s.offer).length;
  return (
    <Link
      href="/sponsors?from=/news"
      aria-label={offers ? `Our sponsors: ${offers === 1 ? "1 offer" : `${offers} offers`} for Deen Squad families` : "Our sponsors"}
      className="flex min-h-14 items-center gap-2.5 rounded-app bg-paper py-2 pr-3 pl-4 text-ink shadow-card transition-transform active:scale-[0.99]"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-small font-bold whitespace-nowrap">Our sponsors</span>
        {offers ? <span className="text-meta whitespace-nowrap text-ink-muted">{offers === 1 ? "1 offer" : `${offers} offers`}</span> : null}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
        {sponsors.slice(0, 5).map((s) => {
          const icon = sponsorIcon(s);
          return <SponsorLogo key={s.id} name={s.name} fileId={icon.fileId} bg={icon.bg} size={32} />;
        })}
        {sponsors.length > 5 ? <span className="text-meta text-ink-muted">+{sponsors.length - 5}</span> : null}
      </span>
      <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
    </Link>
  );
}
