import "server-only";
import sharp from "sharp";

/** Longest side of a stored child photo: the register shows it at 40–96px. */
export const PHOTO_SIDE = 512;

/**
 * Re-encodes a child's photo on the server before it's stored: turned upright, at most 512px, JPEG, and with no
 * metadata at all (sharp drops EXIF unless asked to keep it), so a phone's GPS location or camera details never
 * reach the club, whether or not the browser shrank it first. Null when the bytes aren't a readable image.
 */
export async function cleanPhoto(data: Uint8Array): Promise<{ mime: "image/jpeg"; data: Uint8Array } | null> {
  try {
    const out = await sharp(data, { limitInputPixels: 50_000_000, failOn: "error" })
      .rotate()
      .resize(PHOTO_SIDE, PHOTO_SIDE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { mime: "image/jpeg", data: new Uint8Array(out) };
  } catch {
    return null;
  }
}

/** Longest side of a stored sports hub screenshot: enough for its QR code to stay readable at the gate. */
export const SCREENSHOT_SIDE = 1200;

/**
 * Re-encodes a parent's screenshot of their sports hub entry code before it's stored: turned upright, at most 1200px,
 * no metadata. Lossless PNG (a QR code's sharp edges blur in JPEG), unless the original was a JPEG photo, which stays
 * a high-quality JPEG (a PNG of it would be several times the size). Null when the bytes aren't a readable image.
 */
export async function cleanScreenshot(data: Uint8Array): Promise<{ mime: "image/png" | "image/jpeg"; data: Uint8Array } | null> {
  try {
    const image = sharp(data, { limitInputPixels: 50_000_000, failOn: "error" });
    const { format } = await image.metadata();
    const sized = image
      .rotate()
      .resize(SCREENSHOT_SIDE, SCREENSHOT_SIDE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" });
    if (format === "jpeg") {
      const out = await sized.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
      return { mime: "image/jpeg", data: new Uint8Array(out) };
    }
    const out = await sized.png({ compressionLevel: 9 }).toBuffer();
    return { mime: "image/png", data: new Uint8Array(out) };
  } catch {
    return null;
  }
}
