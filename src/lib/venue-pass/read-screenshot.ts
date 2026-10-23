import { decode, fitWithin } from "../photo-resize";
import { readQrAnyWay, readSides } from "./qr";

// In the browser: reads the QR code in a parent's screenshot of their sports hub entry code, so only its text is sent
// and the app can draw it crisp. When there's no readable code in it, a PNG of the screenshot (at most 1200px) to
// upload instead, which also turns an iPhone HEIC into something the server can read. jsQR is loaded only when needed.

/** The fallback picture's longest side (the server keeps at most this too). */
export const SCREENSHOT_MAX_PX = 1200;

export type ScreenshotResult = { text: string } | { image: Blob } | null;

/** The code's text, else a PNG to upload, else null when the browser can't read the file at all (send it as it is). */
export async function readScreenshot(file: File): Promise<ScreenshotResult> {
  let picture: Awaited<ReturnType<typeof decode>>;
  try {
    picture = await decode(file);
  } catch {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const draw = (side: number) => {
      const size = fitWithin(picture.width, picture.height, side);
      canvas.width = size.width;
      canvas.height = size.height;
      // A transparent screenshot reads as black on black otherwise.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(picture.image, 0, 0, size.width, size.height);
      return size;
    };
    try {
      const { default: jsQR } = await import("jsqr");
      // Several sizes: a photo of a printed ticket often reads only when shrunk.
      for (const side of readSides(Math.max(picture.width, picture.height))) {
        const size = draw(side);
        const text = readQrAnyWay(jsQR, ctx.getImageData(0, 0, size.width, size.height).data, size.width, size.height);
        if (text) return { text };
      }
    } catch {
      // jsQR didn't load (no signal): upload the picture instead.
    }
    draw(SCREENSHOT_MAX_PX);
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return image ? { image } : null;
  } finally {
    picture.done();
  }
}
