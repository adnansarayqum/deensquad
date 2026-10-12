import type jsQRType from "jsqr";

// A parent's own entry QR code for the sports hub (Bobby Moore Sports Hub), kept beside the children's attendance QR
// codes. Pure and shared by the browser (reading a screenshot), the server (drawing it again) and the offline page.
// No server imports.

/** The longest code text kept (the database refuses more). */
export const VENUE_CODE_MAX = 1000;

/** The biggest screenshot (as a data URL, in characters) the phone keeps for no signal. */
export const OFFLINE_IMAGE_MAX = 300_000;

/**
 * How the app draws the code again: black on white with the standard 4-module quiet zone, so a gate scanner reads it
 * as easily as the hub's own. The same options on /pass, Friday and the offline page.
 */
export const VENUE_QR_OPTIONS = {
  margin: 4,
  errorCorrectionLevel: "M",
  color: { dark: "#000000", light: "#ffffff" },
} as const;

/** The text of a code as read, kept exactly (it's what the hub's scanner expects), or null if empty or too long. */
export function cleanVenueCode(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "" || value.length > VENUE_CODE_MAX) return null;
  // A NUL can't be stored in Postgres text; nothing else is touched.
  if (value.includes("\u0000")) return null;
  return value;
}

/** The text inside a picture's pixels (RGBA), or null when there's no readable QR code in it. */
export function readQrPixels(jsQR: typeof jsQRType, pixels: Uint8ClampedArray, width: number, height: number): string | null {
  // Screenshots in dark mode can be light-on-dark, so both ways round.
  const found = jsQR(pixels, width, height, { inversionAttempts: "attemptBoth" });
  return found ? cleanVenueCode(found.data) : null;
}

/** Whether a screenshot of this many bytes fits on the phone for no signal once it's a base64 data URL. */
export function fitsOffline(bytes: number): boolean {
  return bytes > 0 && Math.ceil(bytes / 3) * 4 + 32 <= OFFLINE_IMAGE_MAX;
}
