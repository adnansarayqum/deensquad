// YouTube links on session plans and practice sheets. Coaches paste whatever the share button gave them; the app
// keeps only the video's id (and a start time), so nothing but YouTube is ever stored or embedded.

export type YouTubeVideo = { id: string; start: number | null };

export const VIDEO_ERROR = "Paste a YouTube link (youtube.com or youtu.be).";

const ID = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const SHORT_HOST = "youtu.be";

/** "90", "90s", "1m30s", "1h2m3s" → seconds; anything else null. */
function seconds(value: string | null): number | null {
  if (!value) return null;
  const plain = /^(\d{1,6})s?$/.exec(value);
  if (plain) return Number(plain[1]) || null;
  const parts = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(value);
  if (!parts || value === "") return null;
  const total = Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0);
  return total > 0 ? total : null;
}

/**
 * A YouTube link's video id and start time, or null for anything that isn't a YouTube video link:
 * youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, youtube.com/embed/ID, youtube.com/live/ID, on www., m. or
 * none, with an optional t= or start= in seconds (or 1m30s). The host must be YouTube's own, exactly.
 */
export function parseYouTube(input: unknown): YouTubeVideo | null {
  if (typeof input !== "string") return null;
  let text = input.trim();
  if (!text || text.length > 300) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  if (host === SHORT_HOST) {
    if (path.length === 1) id = path[0];
  } else if (WATCH_HOSTS.has(host)) {
    if (path.length === 1 && path[0] === "watch") id = url.searchParams.get("v") ?? undefined;
    else if (path.length === 2 && ["shorts", "embed", "live", "v"].includes(path[0])) id = path[1];
  }
  if (!id || !ID.test(id)) return null;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start") ?? hash.get("t"));
  return { id, start };
}

/** What's stored: https://www.youtube.com/watch?v=<id>[&t=<seconds>]. */
export function canonicalYouTube(v: YouTubeVideo): string {
  return `https://www.youtube.com/watch?v=${v.id}${v.start ? `&t=${v.start}` : ""}`;
}

/** The form's "YouTube video link": blank is no video; anything else must be a YouTube link. */
export function readVideoField(value: FormDataEntryValue | null): { ok: true; url: string | null } | { ok: false; error: string } {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { ok: true, url: null };
  const video = parseYouTube(text);
  return video ? { ok: true, url: canonicalYouTube(video) } : { ok: false, error: VIDEO_ERROR };
}

/** The privacy-enhanced embed (youtube-nocookie.com), loaded only when a parent taps play. */
export function embedUrl(v: YouTubeVideo): string {
  return `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&autoplay=1${v.start ? `&start=${v.start}` : ""}`;
}

export function thumbnailUrl(v: YouTubeVideo): string {
  return `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
}
