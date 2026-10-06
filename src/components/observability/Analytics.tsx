"use client";

import { usePathname } from "next/navigation";
import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";
import { doNotTrack, setAnalyticsOn, trackPageview } from "@/lib/analytics";
import type { AnalyticsConfig } from "@/lib/observability/config";
import { isTrackedPath } from "@/lib/observability/urls";

// The script tag and its sender are fetched only when analytics is on, so they cost nothing otherwise.
// (React.lazy rather than next/dynamic, which would add its own code to every page.) Client-only: see `allowed`.
const AnalyticsScript = lazy(() => import("./AnalyticsScript"));

const noSubscribe = () => () => {};

/**
 * Counts a page view, at the normalised address, on every navigation, and loads the club's analytics script
 * (Plausible or Umami). Rendered by the root layout only when analytics is configured. Nothing at all when the
 * browser sends Do Not Track. Neither tool sets cookies.
 */
export function Analytics({ config }: { config: AnalyticsConfig }) {
  const path = usePathname();
  // Decided in the browser (the server can't know Do Not Track), so the server renders nothing.
  const allowed = useSyncExternalStore(noSubscribe, () => !doNotTrack(), () => false);

  useEffect(() => {
    setAnalyticsOn(allowed);
    return () => setAnalyticsOn(false);
  }, [allowed]);

  useEffect(() => {
    if (allowed && isTrackedPath(path)) trackPageview();
  }, [allowed, path]);

  return allowed ? (
    <Suspense fallback={null}>
      <AnalyticsScript config={config} />
    </Suspense>
  ) : null;
}
