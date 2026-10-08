/**
 * A child's round photo for staff (and the child's own parents), from /api/files (row level security: staff and the
 * child's parents only), or their initials in a neutral circle when there's none. Decorative: the name is always
 * beside it, so `alt=""` and the initials are hidden from screen readers.
 */
export function ChildAvatar({
  photoId,
  firstName,
  lastName,
  size,
  className = "",
}: {
  photoId: string | null;
  firstName: string;
  lastName?: string;
  /** Pixels: 40 on register rows, 72 on the last-in and scanner cards, 96 on detail pages. */
  size: 40 | 72 | 96;
  className?: string;
}) {
  const box = { 40: "h-10 w-10 text-[15px]", 72: "h-[72px] w-[72px] text-[26px]", 96: "h-24 w-24 text-[32px]" }[size];
  if (photoId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served by the app's own /api/files with row level security
      <img
        src={`/api/files/${photoId}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`${box} shrink-0 rounded-pill border-2 border-line bg-cream object-cover ${className}`}
      />
    );
  }
  const initials = `${firstName.trim()[0] ?? ""}${lastName?.trim()[0] ?? ""}`.toUpperCase();
  return (
    <span aria-hidden className={`${box} grid shrink-0 place-items-center rounded-pill border-2 border-line bg-cream font-bold text-ink-muted ${className}`}>
      {initials}
    </span>
  );
}
