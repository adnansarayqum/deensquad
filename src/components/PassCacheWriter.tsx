"use client";

import { useEffect } from "react";
import { clearPassCache, phoneStorage, readHubCache, writePassCache, type CachedHub, type CachedPass, type HubForCache } from "@/lib/pass/cache";
import { OFFLINE_IMAGE_MAX } from "@/lib/venue-pass/qr";

/**
 * Keeps this family's attendance QR codes on the phone (src/lib/pass/cache.ts), for the offline page the service
 * worker shows at the gate with no signal, with the parent's sports hub entry code: its text, or (when only the
 * screenshot was saved, and it's small enough) the screenshot as a data URL, fetched once per file. Renders nothing.
 * Replaces any other user's copy.
 */
export function PassCacheWriter({ user, passes, hub = null }: { user: string; passes: CachedPass[]; hub?: HubForCache | null }) {
  const key = JSON.stringify({ passes, hub });
  useEffect(() => {
    let live = true;
    const wanted = JSON.parse(key) as { passes: CachedPass[]; hub: HubForCache | null };
    const storage = phoneStorage();
    void (async () => {
      let kept: CachedHub | null = null;
      if (wanted.hub && "text" in wanted.hub) kept = { text: wanted.hub.text };
      else if (wanted.hub && "imageId" in wanted.hub) {
        const before = readHubCache(storage, user);
        kept = before && "id" in before && before.id === wanted.hub.imageId ? before : await screenshot(wanted.hub.imageId);
      }
      if (live) writePassCache(storage, user, wanted.passes, kept);
    })();
    return () => {
      live = false;
    };
  }, [user, key]);
  return null;
}

/** The saved screenshot as a data URL, or null if it can't be fetched or is too big to keep. */
async function screenshot(id: string): Promise<CachedHub | null> {
  try {
    const response = await fetch(`/api/files/${id}`, { credentials: "same-origin" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return image.length <= OFFLINE_IMAGE_MAX ? { image, id } : null;
  } catch {
    return null;
  }
}

/** Forgets the saved codes (on the sign-in screen, where every sign-out lands). Renders nothing. */
export function ForgetPassCache() {
  useEffect(() => {
    clearPassCache(phoneStorage());
  }, []);
  return null;
}
