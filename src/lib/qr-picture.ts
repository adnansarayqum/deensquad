import QRCode from "qrcode";

// How the app draws every QR code a phone shows at the gate (children's attendance QR codes on /pass, Friday and the
// offline page; the parent's sports hub entry code): a small black-on-white PNG, 4 pixels a module with the standard
// 4-module quiet zone, shown full width with `image-rendering: pixelated` (QR_IMG_CLASS) so every edge stays sharp
// at any size. Not an inline SVG: Android browsers that darken websites (Samsung Internet's dark mode, Chrome's
// "dark theme for sites") recolour SVG fills, turning the dark squares almost white so the code looks washed out and
// won't scan; they leave pictures alone. The PNG also carries its own quiet zone, so a darkened card behind it
// doesn't matter. Pure: the server and the offline page use the same function (qrcode's PNG on Node, canvas in the
// browser).

export const QR_OPTIONS = {
  margin: 4,
  scale: 4,
  errorCorrectionLevel: "M",
  color: { dark: "#000000", light: "#ffffff" },
} as const;

/** The QR code for `text` as a PNG data URL (around 2 KB for an attendance QR code). Throws if the text can't fit. */
export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { ...QR_OPTIONS, type: "image/png" });
}

/** Classes for the <img>: full width of its box, square, sharp edges when the browser scales it up. */
export const QR_IMG_CLASS = "block aspect-square h-auto w-full [image-rendering:pixelated]";
