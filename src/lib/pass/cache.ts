// The copy of a family's attendance QR codes kept on the phone, for the gate with no signal. Written when a
// parent opens /pass or Friday online (PassCacheWriter), read by the offline page (public/offline-pass.html,
// built from src/offline/pass-page.ts) that the service worker shows for /pass and /friday with no signal.
// Holds only what /pass already shows: each child's QR text, first name and group. One signed-in user at a
// time: every write replaces it, and signing out clears it. No server imports: it runs in the browser.

export const PASS_CACHE_KEY = "ds-pass-cache";

export type CachedPass = { token: string; firstName: string; ageGroup: string };
type Stored = { v: 1; user: string; passes: CachedPass[] };

const TOKEN = /^DSP\.[0-9a-fA-F-]{36}\.[\w-]{22}$/;
const GROUP = /^(U\d{1,2}|Girls)$/;
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

/** localStorage, or null where it's blocked (some private modes throw on access). */
export function phoneStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Saves this user's codes, replacing whatever was there (another user's included). No codes clears it. */
export function writePassCache(storage: Storage | null, user: string, passes: CachedPass[]): void {
  if (!storage) return;
  try {
    const keep = passes.filter(valid).slice(0, MAX_PASSES).map(({ token, firstName, ageGroup }) => ({ token, firstName, ageGroup }));
    if (!user || keep.length === 0) return storage.removeItem(PASS_CACHE_KEY);
    const stored: Stored = { v: 1, user, passes: keep };
    storage.setItem(PASS_CACHE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or blocked: there's simply no offline copy.
  }
}

/** The saved codes; none if there are none, they're damaged, or (when `user` is given) they're someone else's. */
export function readPassCache(storage: Storage | null, user?: string): CachedPass[] {
  if (!storage) return [];
  try {
    const stored = JSON.parse(storage.getItem(PASS_CACHE_KEY) ?? "null") as Partial<Stored> | null;
    if (!stored || stored.v !== 1 || typeof stored.user !== "string" || !Array.isArray(stored.passes)) return [];
    if (user !== undefined && stored.user !== user) return [];
    return stored.passes.filter(valid).slice(0, MAX_PASSES);
  } catch {
    return [];
  }
}

export function clearPassCache(storage: Storage | null): void {
  try {
    storage?.removeItem(PASS_CACHE_KEY);
  } catch {}
}
