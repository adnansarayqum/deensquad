import "server-only";
import jsQR from "jsqr";
import sharp from "sharp";
import { readQrAnyWay, readSides } from "./qr";

/**
 * On the server: the QR code's text in an uploaded screenshot or photo of a sports hub entry code, or null. The
 * phone already tries this before uploading; this catches what it sent as a picture (no JavaScript, an older app,
 * a picture the phone couldn't read), so the code is kept as text and drawn crisp wherever it can be read.
 */
export async function readQrFromImage(data: Uint8Array): Promise<string | null> {
  try {
    const { width = 0, height = 0 } = await sharp(data, { limitInputPixels: 50_000_000, failOn: "error" }).metadata();
    const longest = Math.max(width, height);
    if (!longest) return null;
    for (const side of readSides(longest)) {
      const { data: raw, info } = await sharp(data, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize(side, side, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (info.channels !== 4) continue;
      const text = readQrAnyWay(jsQR, new Uint8ClampedArray(raw), info.width, info.height);
      if (text) return text;
    }
    return null;
  } catch {
    return null;
  }
}
