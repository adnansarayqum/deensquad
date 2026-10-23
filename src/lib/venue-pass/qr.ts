import type jsQRType from "jsqr";

// A parent's own entry QR code for the sports hub (Bobby Moore Sports Hub), kept beside the children's attendance QR
// codes. Pure and shared by the browser (reading a screenshot), the server (drawing it again) and the offline page.
// No server imports.

/** The longest code text kept (the database refuses more). */
export const VENUE_CODE_MAX = 1000;

/** The biggest screenshot (as a data URL, in characters) the phone keeps for no signal. */
export const OFFLINE_IMAGE_MAX = 300_000;

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

/**
 * The longest sides a picture is read at, largest first. A photo of a printed ticket often reads only when shrunk
 * (paper texture and shadows confuse the reader at full size), while a code that's a small part of a full-page
 * screenshot needs the large ones.
 */
export const READ_SIDES = [1600, 1000, 700, 500, 350] as const;

/** The sides to try for a picture whose longest side is `longest`: never larger than the picture itself. */
export function readSides(longest: number): number[] {
  const sides: number[] = READ_SIDES.filter((s) => s < longest);
  return longest <= READ_SIDES[0] ? [longest, ...sides] : sides;
}

/** Black and white at the picture's mean brightness: evens out a grey, unevenly lit photo of a printed code. */
export function highContrast(pixels: Uint8ClampedArray): Uint8ClampedArray {
  const n = pixels.length / 4;
  const grey = new Uint8ClampedArray(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = (pixels[i * 4] * 299 + pixels[i * 4 + 1] * 587 + pixels[i * 4 + 2] * 114) / 1000;
    grey[i] = v;
    sum += v;
  }
  const mean = n ? sum / n : 128;
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < n; i++) {
    const v = grey[i] < mean ? 0 : 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** The text of a QR code in these pixels, as they are or in high contrast, or null. */
export function readQrAnyWay(jsQR: typeof jsQRType, pixels: Uint8ClampedArray, width: number, height: number): string | null {
  return readQrPixels(jsQR, pixels, width, height) ?? readQrPixels(jsQR, highContrast(pixels), width, height);
}

/** Whether a screenshot of this many bytes fits on the phone for no signal once it's a base64 data URL. */
export function fitsOffline(bytes: number): boolean {
  return bytes > 0 && Math.ceil(bytes / 3) * 4 + 32 <= OFFLINE_IMAGE_MAX;
}
