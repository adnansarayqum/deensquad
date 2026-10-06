"use client";

import { useEffect } from "react";
import { clearPassCache, phoneStorage, writePassCache, type CachedPass } from "@/lib/pass/cache";

/**
 * Keeps this family's attendance QR codes on the phone (src/lib/pass/cache.ts), for the offline page the service
 * worker shows at the gate with no signal. Renders nothing. Replaces any other user's copy.
 */
export function PassCacheWriter({ user, passes }: { user: string; passes: CachedPass[] }) {
  const key = JSON.stringify(passes);
  useEffect(() => {
    writePassCache(phoneStorage(), user, JSON.parse(key) as CachedPass[]);
  }, [user, key]);
  return null;
}

/** Forgets the saved codes (on the sign-in screen, where every sign-out lands). Renders nothing. */
export function ForgetPassCache() {
  useEffect(() => {
    clearPassCache(phoneStorage());
  }, []);
  return null;
}
