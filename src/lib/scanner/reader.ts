// Turns one camera picture into a code, or nothing. Never throws: jsQR does on some real pictures (dark venues,
// glare; Fri 30 Oct 2026, when one throw ended the first scanner's loop), and a picture that can't be read is simply
// not a code. Plain data in and out, so it's tested with saved pictures and no camera (reader.test.ts).

/**
 * jsQR's shape, passed in so the decoder is loaded only when the scanner opens (and so tests can make it throw).
 * Only ever called with "dontInvert". jsQR 1.4's "onlyInvert" throws on every picture (it reads an inverted copy it
 * never made), which the first scanner used for every other frame from 18 Oct 2026: half its frames were thrown
 * away and a light-on-dark code was never read. Found by reader.test.ts, which reads real pictures without a camera.
 */
export type Decode = (data: Uint8ClampedArray, width: number, height: number, options: { inversionAttempts: "dontInvert" }) => { data: string } | null;

/** The longest side the picture is read at: enough for a code on a phone held at arm's length, small enough to be quick. */
export const READ_SIZE = 640;

/** The middle square of a camera picture (what's inside the frame on screen) and the size to read it at. */
export function middleSquare(videoWidth: number, videoHeight: number): { x: number; y: number; side: number; size: number } | null {
  const side = Math.min(videoWidth, videoHeight);
  if (!(side > 0)) return null;
  return { x: (videoWidth - side) / 2, y: (videoHeight - side) / 2, side, size: Math.min(side, READ_SIZE) };
}

export type Read = { code: string | null; skipped: string | null };

/** Turns light into dark and dark into light, in place (the alpha channel is left alone). */
export function invert(pixels: Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255 - pixels[i];
    pixels[i + 1] = 255 - pixels[i + 1];
    pixels[i + 2] = 255 - pixels[i + 2];
  }
}

/**
 * The code in a square picture, if there is one. Odd pictures look for an ordinary dark-on-light code; even ones are
 * inverted first, to find a light-on-dark code (a phone that darkens websites can show one that way), so each
 * picture costs one pass. `pixels` is changed on an even picture: pass a fresh one each time, as the camera gives.
 * `skipped` says why a picture couldn't be read at all, for the console.
 */
export function readCode(decode: Decode, pixels: Uint8ClampedArray, size: number, picture: number): Read {
  try {
    if (picture % 2 === 0) invert(pixels);
    const found = decode(pixels, size, size, { inversionAttempts: "dontInvert" });
    const code = found?.data;
    return { code: typeof code === "string" && code.length > 0 ? code : null, skipped: null };
  } catch (error) {
    return { code: null, skipped: error instanceof Error ? error.message : String(error) };
  }
}
