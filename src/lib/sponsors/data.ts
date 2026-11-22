import type { Queryable } from "../db/types";

export type Sponsor = {
  id: string;
  name: string;
  /** What they pay for, in the club's words: "U10 tournament kit". */
  sponsorsWhat: string | null;
  about: string | null;
  linkUrl: string | null;
  offer: string | null;
  offerHow: string | null;
  logoFileId: string | null;
  active: boolean;
  sort: number;
};

/** The sponsors on show, in the club's order (admins can ask for hidden ones too; RLS gives them to nobody else). */
export async function loadSponsors(tx: Queryable, opts: { includeHidden?: boolean } = {}): Promise<Sponsor[]> {
  const rows = await tx.query<{
    id: string;
    name: string;
    sponsors_what: string | null;
    about: string | null;
    link_url: string | null;
    offer: string | null;
    offer_how: string | null;
    logo_file_id: string | null;
    active: boolean;
    sort: number;
  }>(
    `select id, name, sponsors_what, about, link_url, offer, offer_how, logo_file_id, active, sort
     from sponsors where active or $1 order by sort, lower(name), id`,
    [opts.includeHidden === true],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sponsorsWhat: r.sponsors_what,
    about: r.about,
    linkUrl: r.link_url,
    offer: r.offer,
    offerHow: r.offer_how,
    logoFileId: r.logo_file_id,
    active: r.active,
    sort: r.sort,
  }));
}

/** Only https links, to a real host, are kept or shown: the button opens another site. */
export function cleanSponsorLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

const SOCIAL: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(x|twitter)\.com$/, "X"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)youtube\.com$/, "YouTube"],
];

/** What the link button says: "See them on Instagram" for a social page, else "Visit their website". */
export function sponsorLinkLabel(linkUrl: string): string {
  let host = "";
  try {
    host = new URL(linkUrl).hostname.toLowerCase();
  } catch {
    return "Visit their website";
  }
  const social = SOCIAL.find(([pattern]) => pattern.test(host));
  return social ? `See them on ${social[1]}` : "Visit their website";
}

/** Two letters for a sponsor with no logo yet. */
export function sponsorInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
