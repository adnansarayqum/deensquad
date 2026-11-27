import { sponsorInitials } from "@/lib/sponsors/data";

/** Signed-in screens read a logo through the files route; the public sign-up page through the sponsors' own. */
function src(fileId: string, open: boolean): string {
  return open ? `/api/sponsor-logo/${fileId}` : `/api/files/${fileId}`;
}

/**
 * A sponsor's logo or small icon on a square tile in the logo's own ground colour (white unless the logo is on a
 * colour), or their initials until one is added. Decorative: the sponsor's name is always written beside it.
 */
export function SponsorLogo({ name, fileId, bg, size, open = false }: { name: string; fileId: string | null; bg?: string | null; size: number; open?: boolean }) {
  const box = { width: size, height: size };
  const radius = size < 40 ? "rounded-web" : "rounded-web";
  if (!fileId) {
    return (
      <span aria-hidden style={box} className={`grid shrink-0 place-items-center ${radius} bg-fill font-bold text-ink ${size < 40 ? "text-meta" : "text-small"}`}>
        {sponsorInitials(name)}
      </span>
    );
  }
  return (
    <span style={{ ...box, background: bg ?? "#ffffff" }} className={`grid shrink-0 place-items-center overflow-hidden ${radius} ring-1 ring-line`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the club's own stored file, already sized */}
      <img src={src(fileId, open)} alt="" loading="lazy" className={`h-full w-full object-contain ${size < 40 ? "p-0.5" : "p-1"}`} />
    </span>
  );
}

/**
 * A sponsor's full logo on a 3:2 card in its own ground colour, for a wall of sponsors. The logo is the name here,
 * so it carries it as its text alternative.
 */
export function SponsorCard({
  name,
  fileId,
  bg,
  open = false,
  shape = "card",
  decorative = false,
}: {
  name: string;
  fileId: string | null;
  bg?: string | null;
  open?: boolean;
  /** `card`: 3:2, for a wall of sponsors. `banner`: a strip across the top of a sponsor's own card. */
  shape?: "card" | "banner";
  /** The name is written beside it, so the picture is skipped by screen readers. */
  decorative?: boolean;
}) {
  const size = shape === "banner" ? "h-28 w-full" : "aspect-[3/2] w-full";
  if (!fileId) {
    return (
      <span aria-hidden={decorative} className={`grid ${size} place-items-center rounded-web bg-fill px-2 text-center text-small font-bold text-ink`}>
        {decorative ? sponsorInitials(name) : name}
      </span>
    );
  }
  return (
    <span style={{ background: bg ?? "#ffffff" }} className={`relative block ${size} overflow-hidden rounded-web ring-1 ring-line`}>
      {/* Placed over the box, so the picture's own size never stretches it: the whole logo always fits inside. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- the club's own stored file, already sized */}
      <img src={src(fileId, open)} alt={decorative ? "" : name} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-3" />
    </span>
  );
}
