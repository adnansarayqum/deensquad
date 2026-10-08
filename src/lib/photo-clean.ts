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
