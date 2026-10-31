"use client";

import { useEffect } from "react";

/**
 * Keeps the phone's screen on while the attendance QR codes are showing, so it doesn't dim or lock in the queue at
 * the gate (the Screen Wake Lock API; phones without it just behave as before). Asked again when the parent comes
 * back to the app, since the lock goes when the page is hidden.
 */
export function KeepAwake() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const wake = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<Lock> } }).wakeLock;
    if (!wake) return;
    let lock: Lock | null = null;
    let gone = false;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      wake
        .request("screen")
        .then((l) => {
          if (gone) void l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", ask);
      if (lock) void lock.release().catch(() => {});
    };
  }, []);
  return null;
}
