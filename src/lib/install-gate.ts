// The "add to home screen" step parents see when they use the app in a phone browser instead of the
// installed app. Pure decision first (tested), then the storage it reads and writes. Storage can throw
// (private browsing, blocked cookies): then the count is 0 and a dismissal lasts until the page reloads.

export type InstallGateMode = "hidden" | "android-prompt" | "android-manual" | "ios" | "ios-inapp";

export type InstallGateInput = {
  ua: string;
  /** Running as an installed app: display-mode standalone/fullscreen/minimal-ui, or iOS navigator.standalone. */
  standalone: boolean;
  /** matchMedia("(pointer: coarse)"): a touch screen is the main pointer. */
  coarse: boolean;
  /** Viewport width in CSS pixels. */
  width: number;
  isStaff: boolean;
  dismissCount: number;
  sessionDismissed: boolean;
  /** A stashed beforeinstallprompt event is ready to use. */
  hasPrompt: boolean;
};

/** Tailwind's lg breakpoint: at this width and above the gate never shows. */
export const GATE_MAX_WIDTH = 1024;
/** After this many dismissals "Not now" goes and only the small "Continue in browser" link remains. */
export const NOT_NOW_LIMIT = 2;

/** In-app browsers (WhatsApp, Instagram, Facebook, Gmail/Google app, Line) can't add to the home screen. */
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|GSA\/|Line\/|WhatsApp/;

export function isIos(ua: string, coarse: boolean): boolean {
  // iPadOS Safari asks for desktop sites with a Mac user agent; a touch screen gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && coarse);
}

export function installGateMode(input: InstallGateInput): { mode: InstallGateMode; offerNotNow: boolean } {
  const { ua, standalone, coarse, width, isStaff, dismissCount, sessionDismissed, hasPrompt } = input;
  if (isStaff || standalone || !coarse || width >= GATE_MAX_WIDTH || sessionDismissed) return { mode: "hidden", offerNotNow: false };
  const offerNotNow = dismissCount < NOT_NOW_LIMIT;
  if (isIos(ua, coarse)) return { mode: IN_APP.test(ua) ? "ios-inapp" : "ios", offerNotNow };
  return { mode: hasPrompt ? "android-prompt" : "android-manual", offerNotNow };
}

const SESSION_KEY = "ds-install-gate-dismissed";
const COUNT_KEY = "ds-install-gate-count";
let dismissedInMemory = false;

export function readDismissCount(): number {
  try {
    const n = Number.parseInt(localStorage.getItem(COUNT_KEY) ?? "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function readSessionDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** "Not now" or "Continue in browser": gone for this visit, and one more towards the limit. */
export function recordDismiss(): void {
  dismissedInMemory = true;
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Remembered in memory only.
  }
  try {
    localStorage.setItem(COUNT_KEY, String(readDismissCount() + 1));
  } catch {
    // The count stays 0.
  }
}

/** For tests: forget an in-memory dismissal. */
export function resetInstallGateMemory(): void {
  dismissedInMemory = false;
}
