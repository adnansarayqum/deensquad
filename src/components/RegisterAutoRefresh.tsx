"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How often an open register picks up check-ins made on other coaches' phones. */
const EVERY_MS = 20_000;

/**
 * Keeps the register current while it's on screen: every 20 s, and as soon as the coach comes back to the app.
 * An installed iPhone app has no pull-to-refresh, so without this another coach's scans never show.
 */
export function RegisterAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const timer = setInterval(() => {
      if (visible() && navigator.onLine !== false) router.refresh();
    }, EVERY_MS);
    const onShow = () => {
      if (visible()) router.refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router]);
  return null;
}
