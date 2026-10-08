// Shrinks a child's photo in the browser before it's sent: at most 512px on its longest side, as a JPEG. A phone
// photo is several megabytes; the coaches' register shows it at 40px. Returns null when the browser can't read the
// file (e.g. HEIC outside Safari), and the original is sent for the server to check.

export const PHOTO_MAX_PX = 512;

/** The size to draw at: the longest side at most `max`, never enlarged. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_PX): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    // Turned the right way up from its EXIF orientation, as the browser shows it.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

export async function shrinkPhoto(file: File, max = PHOTO_MAX_PX): Promise<Blob | null> {
  try {
    const { image, width, height, done } = await decode(file);
    try {
      const size = fitWithin(width, height, max);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0, size.width, size.height);
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    } finally {
      done();
    }
  } catch {
    return null;
  }
}
