import { sponsorInitials } from "@/lib/sponsors/data";

/**
 * A sponsor's logo on a white tile (logos are drawn for white, in both themes), or their initials until one is added.
 * Decorative: the sponsor's name is always written beside it.
 */
export function SponsorLogo({ name, fileId, size }: { name: string; fileId: string | null; size: number }) {
  const box = { width: size, height: size };
  if (!fileId) {
    return (
      <span aria-hidden style={box} className="grid shrink-0 place-items-center rounded-xl bg-fill text-[15px] font-bold text-ink">
        {sponsorInitials(name)}
      </span>
    );
  }
  return (
    <span style={box} className="grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-line">
      {/* eslint-disable-next-line @next/next/no-img-element -- the club's own stored file, already sized */}
      <img src={`/api/files/${fileId}`} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
    </span>
  );
}
