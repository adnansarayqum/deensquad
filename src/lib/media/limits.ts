// Pictures and videos on news, session details and staff messages: shared by the browser picker and the server.

/** A phone video of a couple of minutes at 1080p. Longer or 4K ones are refused with how to make them smaller. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
/** A picture as taken (the browser shrinks it first when it can, so this is the no-JavaScript or HEIC case). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Per post, session or message. */
export const MAX_MEDIA_ITEMS = 10;
/** The browser shrinks pictures to this before sending; the server does the same whatever arrives. */
export const IMAGE_SIDE = 2000;
/** Unlinked uploads (a form never sent, or what they were on deleted) are removed after this. */
export const ORPHAN_HOURS = 24;

/** Under every picker: the club posts only children whose parents agreed (players.photo_consent). */
export const PHOTO_CONSENT_HINT = "Only post children whose parents said yes to photos. Videos up to 200 MB.";

export function sizeText(bytes: number): string {
  const mb = Math.ceil((bytes / (1024 * 1024)) * 10) / 10;
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function videoTooBig(bytes: number): string {
  return `That video is ${sizeText(bytes)}. The limit is 200 MB. Trim it on your phone first, or record at 1080p rather than 4K.`;
}

export function imageTooBig(bytes: number): string {
  return `That picture is ${sizeText(bytes)}. The limit is 25 MB.`;
}

/** "0:45", "12:03". */
export function durationText(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "a photo", "3 photos and a video": what a message with only pictures says in place of words. */
export function mediaPhrase(kinds: readonly ("image" | "video")[]): string {
  const images = kinds.filter((k) => k === "image").length;
  const videos = kinds.length - images;
  const part = (n: number, one: string, many: string) => (n === 1 ? `a ${one}` : `${n} ${many}`);
  const parts = [images ? part(images, "photo", "photos") : null, videos ? part(videos, "video", "videos") : null].filter(Boolean);
  return parts.join(" and ");
}
