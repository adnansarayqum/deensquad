// The copy of a family's attendance QR codes kept on the phone, for the gate with no signal. Written when a
// parent opens /pass or Friday online (PassCacheWriter), read by the offline page (public/offline-pass.html,
// built from src/offline/pass-page.ts) that the service worker shows for /pass and /friday with no signal.
// Holds only what /pass already shows: each child's QR text, first name and group, and the parent's own sports hub
// entry code (its text, or a small screenshot of it as a data URL). One signed-in user at a time: every write
// replaces it, and signing out clears it. No server imports: it runs in the browser.

import { cleanVenueCode, OFFLINE_IMAGE_MAX } from "../venue-pass/qr";

export const PASS_CACHE_KEY = "ds-pass-cache";

export type CachedPass = { token: string; firstName: string; ageGroup: string };
/** The parent's sports hub entry code as kept on the phone: its text, or its screenshot (and the file it came from). */
export type CachedHub = { text: string } | { image: string; id: string };
/** What the page knows about it: the text, or the screenshot's file id (fetched and kept by PassCacheWriter). */
export type HubForCache = { text: string } | { imageId: string };
type Stored = { v: 1; user: string; passes: CachedPass[]; hub?: CachedHub };

// Today's codes (an upper-case id and a 16-letter signature) and the longer ones made before October 2026.
const TOKEN = /^DSP\.[0-9a-fA-F-]{36}\.(?:[A-Z2-7]{16}|[\w-]{22})$/;
const GROUP = /^(U\d{1,2}|Girls)$/;
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_PASSES = 12;

function valid(p: unknown): p is CachedPass {
  if (!p || typeof p !== "object") return false;
  const { token, firstName, ageGroup } = p as Record<string, unknown>;
  return (
    typeof token === "string" &&
    TOKEN.test(token) &&
    typeof firstName === "string" &&
    firstName.length > 0 &&
    firstName.length <= 60 &&
    typeof ageGroup === "string" &&
    GROUP.test(ageGroup)
  );
}

/** Only the two shapes, nothing else kept: the text as read, or a small picture with the id of its file. */
function validHub(h: unknown): CachedHub | null {
  if (!h || typeof h !== "object") return null;
  const { text, image, id } = h as Record<string, unknown>;
  if (typeof text === "string") {
    const clean = cleanVenueCode(text);
    return clean ? { text: clean } : null;
  }
  if (typeof image === "string" && typeof id === "string" && image.length <= OFFLINE_IMAGE_MAX && DATA_URL.test(image) && FILE_ID.test(id)) {
    return { image, id };
  }
  return null;
}

/** localStorage, or null where it's blocked (some private modes throw on access). */
export function phoneStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Saves this user's codes, replacing whatever was there (another user's included). No codes and no sports hub code
 * clears it.
 */
export function writePassCache(storage: Storage | null, user: string, passes: CachedPass[], hub: CachedHub | null = null): void {
  if (!storage) return;
  try {
    const keep = passes.filter(valid).slice(0, MAX_PASSES).map(({ token, firstName, ageGroup }) => ({ token, firstName, ageGroup }));
    const keepHub = validHub(hub);
    if (!user || (keep.length === 0 && !keepHub)) return storage.removeItem(PASS_CACHE_KEY);
    const stored: Stored = { v: 1, user, passes: keep, ...(keepHub ? { hub: keepHub } : {}) };
    storage.setItem(PASS_CACHE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or blocked: there's simply no offline copy.
  }
}

function readStored(storage: Storage | null, user?: string): Stored | null {
  if (!storage) return null;
  try {
    const stored = JSON.parse(storage.getItem(PASS_CACHE_KEY) ?? "null") as Partial<Stored> | null;
    if (!stored || stored.v !== 1 || typeof stored.user !== "string" || !Array.isArray(stored.passes)) return null;
    if (user !== undefined && stored.user !== user) return null;
    return stored as Stored;
  } catch {
    return null;
  }
}

/** The saved codes; none if there are none, they're damaged, or (when `user` is given) they're someone else's. */
export function readPassCache(storage: Storage | null, user?: string): CachedPass[] {
  return readStored(storage, user)?.passes.filter(valid).slice(0, MAX_PASSES) ?? [];
}

/** The saved sports hub entry code, on the same terms. */
export function readHubCache(storage: Storage | null, user?: string): CachedHub | null {
  return validHub(readStored(storage, user)?.hub);
}

export function clearPassCache(storage: Storage | null): void {
  try {
    storage?.removeItem(PASS_CACHE_KEY);
  } catch {}
}
