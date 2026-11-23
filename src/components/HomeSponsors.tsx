import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SponsorLogo } from "@/components/SponsorLogo";
import { requireParent } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { loadSponsors, sponsorIcon } from "@/lib/sponsors/data";

/** Home's one-row link to the sponsors page: up to five logos and how many have an offer. Nothing until there's a sponsor. */
export async function HomeSponsors() {
  const user = await requireParent();
  const sponsors = await asUser(user.id, (tx) => loadSponsors(tx));
  if (sponsors.length === 0) return null;
  const offers = sponsors.filter((s) => s.offer).length;
  return (
    <Link
      href="/sponsors?from=/news"
      aria-label={offers ? `Our sponsors: ${offers === 1 ? "1 offer" : `${offers} offers`} for Deen Squad families` : "Our sponsors"}
      className="flex min-h-16 items-center gap-3 rounded-app bg-paper px-3.5 py-3 text-ink shadow-card transition-transform active:scale-[0.99]"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[15px] font-bold">Our sponsors</span>
        <span className="flex items-center gap-1.5">
          {sponsors.slice(0, 5).map((s) => {
            const icon = sponsorIcon(s);
            return <SponsorLogo key={s.id} name={s.name} fileId={icon.fileId} bg={icon.bg} size={36} />;
          })}
          {sponsors.length > 5 ? <span className="text-[13px] text-ink-muted">+{sponsors.length - 5}</span> : null}
        </span>
        {offers ? <span className="text-[13px] text-ink-muted">{offers === 1 ? "1 offer" : `${offers} offers`} for Deen Squad families</span> : null}
      </span>
      <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
    </Link>
  );
}
