"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on the parent screens, so /pass and /friday can show the saved attendance QR codes with no signal.
 * Registering asks for nothing (notifications are only offered by NotificationsCard). Renders nothing.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    try {
      navigator.serviceWorker?.register("/sw.js").catch(() => {});
    } catch {}
  }, []);
  return null;
}
