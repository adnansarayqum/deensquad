import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { qrDataUrl } from "./qr-picture";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ isDemo: () => false }));
const { passToken } = await import("./pass/token");

/** The picture's pixels, scaled as a phone shows it (nearest neighbour, as `image-rendering: pixelated`). */
async function shown(url: string, side: number) {
  expect(url).toMatch(/^data:image\/png;base64,/);
  const { data, info } = await sharp(Buffer.from(url.split(",")[1], "base64"))
    .resize(side, side, { kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

describe("attendance QR code picture", () => {
  const token = passToken("20000000-0000-4000-8000-000000000001");

  it("is a small version 3 code (29 squares a side), all alphanumeric", () => {
    expect(token).toMatch(/^[A-Z0-9.-]+$/);
    expect(QRCode.create(token, { errorCorrectionLevel: "M" }).version).toBe(3);
  });

  it("is a small black-and-white PNG with a 4-square quiet zone that reads back at phone sizes", async () => {
    const url = await qrDataUrl(token);
    expect(url.length).toBeLessThan(4000);
    const raw = await sharp(Buffer.from(url.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
    // (29 + 2 × 4) squares × 4 pixels.
    expect(raw.info.width).toBe(148);
    // Only pure black and pure white.
    const values = new Set(raw.data);
    expect([...values].every((v) => v === 0 || v === 255)).toBe(true);
    for (const side of [148, 497, 788, 1050]) {
      const p = await shown(url, side);
      expect(jsQR(p.data, p.width, p.height, { inversionAttempts: "dontInvert" })?.data).toBe(token);
    }
  });
});
