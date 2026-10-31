import { ExternalLink } from "lucide-react";
import { directionsUrl } from "@/lib/parent/views";

/** "Directions" to a session's venue: a Google Maps search, opened outside the app. Nothing while the venue isn't known. */
export function Directions({ venue }: { venue: string }) {
  const url = directionsUrl(venue);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      aria-label={`Directions to ${venue}`}
      className="inline-flex min-h-12 shrink-0 items-center gap-1.5 text-[15px] font-bold text-grass-text underline"
    >
      Directions
      <ExternalLink aria-hidden size={16} />
    </a>
  );
}
