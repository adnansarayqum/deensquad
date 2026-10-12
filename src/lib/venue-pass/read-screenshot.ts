import { decode, fitWithin } from "../photo-resize";
import { readQrPixels } from "./qr";

// In the browser: reads the QR code in a parent's screenshot of their sports hub entry code, so only its text is sent
// and the app can draw it crisp. When there's no readable code in it, a PNG of the screenshot (at most 1200px) to
// upload instead, which also turns an iPhone HEIC into something the server can read. jsQR is loaded only when needed.

/** Read at up to this size: big enough for a code that's a small part of a full-page screenshot. */
const READ_MAX_PX = 1600;
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
    const size = fitWithin(picture.width, picture.height, READ_MAX_PX);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // A transparent screenshot reads as black on black otherwise.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(picture.image, 0, 0, size.width, size.height);
    try {
      const { default: jsQR } = await import("jsqr");
      const text = readQrPixels(jsQR, ctx.getImageData(0, 0, size.width, size.height).data, size.width, size.height);
      if (text) return { text };
    } catch {
      // jsQR didn't load (no signal): upload the picture instead.
    }
    const small = fitWithin(picture.width, picture.height, SCREENSHOT_MAX_PX);
    const out = document.createElement("canvas");
    out.width = small.width;
    out.height = small.height;
    const outCtx = out.getContext("2d");
    if (!outCtx) return null;
    outCtx.drawImage(canvas, 0, 0, small.width, small.height);
    const image = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
    return image ? { image } : null;
  } finally {
    picture.done();
  }
}
