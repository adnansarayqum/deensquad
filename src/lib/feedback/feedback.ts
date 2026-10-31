/**
 * What a tap feels like once it has saved: a short buzz on phones that support it (Android; iPhones ignore it) and
 * a "Saved" note that slides up above the tab bar (`Toaster`, in the parent layout). Visual and touch only: the
 * button's own state (aria-pressed, its words) already tells a screen reader what changed.
 */
export const TOAST_EVENT = "ds-toast";

export function buzz(ms = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    // Some browsers throw when vibration isn't allowed; a missing buzz is fine.
  }
}

export function toast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}

/** A tap that saved: buzz and say so. */
export function saved(message: string) {
  buzz();
  toast(message);
}
