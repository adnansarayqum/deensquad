// Anonymous page counts and a few named events, sent to Plausible or Umami when the club turns one on
// (src/lib/observability/config.ts; the script is loaded by src/components/observability/Analytics.tsx).
// Every address is normalised first (normaliseUrl: no query string, ids as :id), the referrer is never sent,
// and event properties are fixed labels only, never ids or names. With analytics off, track() does nothing.

import { normaliseUrl } from "./observability/urls";

type Events = {
  install_gate_shown: { mode: string };
  install_gate_dismissed: undefined;
  install_prompt_accepted: undefined;
  availability_answered: { answer: "coming" | "away" };
  news_acknowledged: undefined;
  order_placed: { pay: "card" | "bank" };
};
export type AnalyticsEventName = keyof Events;

export type Hit = { name: string | null; props?: Record<string, string> };
/** Hands one hit to the provider's script; false when the script isn't ready yet (the hit waits). */
export type Sender = (hit: Hit, url: string) => boolean;

const MAX_WAITING = 20;
/** null while analytics is off: nothing is kept or sent. */
let state: { sender: Sender | null; waiting: { hit: Hit; url: string }[] } | null = null;

/** True when the browser asks not to be tracked (Do Not Track). Then no script is loaded and nothing is sent. */
export function doNotTrack(): boolean {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const values = [nav.doNotTrack, nav.msDoNotTrack, (window as Window & { doNotTrack?: string }).doNotTrack];
  return values.some((v) => v === "1" || v === "yes");
}

/**
 * One-off events raised before analytics has switched on: on a full page load the page's own effects run before
 * the root layout's Analytics. Handed over when it switches on; never sent if it doesn't (Do Not Track).
 */
const early: { hit: Hit; url: string }[] = [];
/** Keys of one-off events already counted in this tab (sessionStorage too, so a reload doesn't count them again). */
const counted = new Set<string>();

/** Turns analytics on or off (the Analytics component, before its script has loaded). Hits wait while it's on with no sender. */
export function setAnalyticsOn(on: boolean) {
  if (!on) state = null;
  else {
    state ??= { sender: null, waiting: [] };
    state.waiting.push(...early.splice(0));
    while (state.waiting.length > MAX_WAITING) state.waiting.shift();
    flush();
  }
}

/** The provider's sender, once its component has loaded (null to stop sending). Hits keep waiting meanwhile. */
export function setAnalyticsSender(sender: Sender | null) {
  if (!state) return;
  state.sender = sender;
  flush();
}

/** Sends whatever was waiting for the provider's script (called again when the script has loaded). */
export function flush() {
  const { sender, waiting } = state ?? {};
  if (!state || !sender || !waiting) return;
  state.waiting = waiting.filter((item) => !sender(item.hit, item.url));
}

function send(hit: Hit) {
  if (!state || typeof window === "undefined") return;
  if (state.waiting.length >= MAX_WAITING) state.waiting.shift();
  state.waiting.push({ hit, url: normaliseUrl(window.location.href) });
  flush();
}

/** One page view, at the current address (normalised). */
export function trackPageview() {
  send({ name: null });
}

/** A named event with fixed labels. Does nothing when analytics is off. */
export function track<N extends AnalyticsEventName>(name: N, ...props: Events[N] extends undefined ? [] : [Events[N]]) {
  send({ name, props: props[0] as Record<string, string> | undefined });
}

/**
 * A named event counted at most once per `key` in this browser tab (reloads included), even if it's raised before
 * analytics has switched on. Only rendered when analytics is configured (e.g. order_placed on the order page).
 */
export function trackOnce<N extends AnalyticsEventName>(key: string, name: N, ...props: Events[N] extends undefined ? [] : [Events[N]]) {
  if (typeof window === "undefined" || counted.has(key)) return;
  counted.add(key);
  const storageKey = `ds-counted:${key}`;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");
  } catch {
    // no storage: once per page load instead
  }
  const hit: Hit = { name, props: props[0] as Record<string, string> | undefined };
  if (state) send(hit);
  else if (early.length < MAX_WAITING) early.push({ hit, url: normaliseUrl(window.location.href) });
}
