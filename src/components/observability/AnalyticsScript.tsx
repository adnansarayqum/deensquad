"use client";

import Script from "next/script";
import { useEffect } from "react";
import { flush, setAnalyticsSender, type Sender } from "@/lib/analytics";
import type { AnalyticsConfig } from "@/lib/observability/config";

type PlausibleFn = ((name: string, options?: { u?: string; props?: Record<string, string> }) => void) & { q?: unknown[][] };
type UmamiPayload = Record<string, unknown>;
type AnalyticsWindow = Window & { plausible?: PlausibleFn; umami?: { track: (payload: (base: UmamiPayload) => UmamiPayload) => void } };

function plausibleSender(): Sender {
  const w = window as AnalyticsWindow;
  // Plausible's own queue: calls made before its script loads are sent once it has.
  w.plausible ??= Object.assign((...args: unknown[]) => void (w.plausible!.q ??= []).push(args), {});
  // Plausible's script always sends document.referrer, which for a page opened from inside the app is a full
  // address (query and all). Give it nothing instead, as Umami gets.
  try {
    Object.defineProperty(document, "referrer", { get: () => "", configurable: true });
  } catch {
    // leave it
  }
  return (hit, u) => {
    w.plausible!(hit.name ?? "pageview", hit.props ? { u, props: hit.props } : { u });
    return true;
  };
}

function umamiSender(): Sender {
  const w = window as AnalyticsWindow;
  return (hit, url) => {
    if (!w.umami) return false;
    // Replace the address Umami would send (it keeps the query string) and send no referrer.
    w.umami.track((base) => ({ ...base, url, referrer: "", ...(hit.name ? { name: hit.name, data: hit.props } : {}) }));
    return true;
  };
}

/** The provider's script (loaded after the page is interactive) and the sender that hands it each hit. Loaded only when analytics is on. */
export default function AnalyticsScript({ config }: { config: AnalyticsConfig }) {
  const { provider } = config;
  useEffect(() => {
    setAnalyticsSender(provider === "plausible" ? plausibleSender() : umamiSender());
    return () => setAnalyticsSender(null);
  }, [provider]);

  return config.provider === "plausible" ? (
    <Script id="ds-analytics" src={config.src} data-domain={config.domain} strategy="afterInteractive" />
  ) : (
    <Script id="ds-analytics" src={config.src} data-website-id={config.websiteId} data-auto-track="false" strategy="afterInteractive" onLoad={flush} />
  );
}
