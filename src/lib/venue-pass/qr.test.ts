import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { cleanVenueCode, fitsOffline, OFFLINE_IMAGE_MAX, readQrPixels, VENUE_CODE_MAX, VENUE_QR_OPTIONS } from "./qr";

vi.mock("server-only", () => ({}));
const { cleanScreenshot, SCREENSHOT_SIDE } = await import("../photo-clean");

/** A QR code drawn as RGBA pixels, `scale` pixels a module, the way it's drawn with VENUE_QR_OPTIONS (quiet zone included). */
function pixels(text: string, scale = 4, invert = false) {
  const qr = QRCode.create(text, { errorCorrectionLevel: VENUE_QR_OPTIONS.errorCorrectionLevel });
  const n = qr.modules.size;
  const side = (n + 2 * VENUE_QR_OPTIONS.margin) * scale;
  const out = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / scale) - VENUE_QR_OPTIONS.margin;
      const my = Math.floor(y / scale) - VENUE_QR_OPTIONS.margin;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx) === 1;
      const v = dark !== invert ? 0 : 255;
      out.set([v, v, v, 255], (y * side + x) * 4);
    }
  }
  return { data: out, side };
}

describe("reading a sports hub entry code", () => {
  it("reads the text of a code drawn the way the app draws it, light-on-dark (a dark-mode screenshot) too", () => {
    const code = "https://booking.example/entry/ABC123?member=987654";
    const light = pixels(code);
    expect(readQrPixels(jsQR, light.data, light.side, light.side)).toBe(code);
    const dark = pixels(code, 4, true);
    expect(readQrPixels(jsQR, dark.data, dark.side, dark.side)).toBe(code);
  });

  it("gives null for a picture with no code in it", () => {
    const blank = new Uint8ClampedArray(200 * 200 * 4).fill(255);
    expect(readQrPixels(jsQR, blank, 200, 200)).toBeNull();
  });

  it("draws the code back as a crisp SVG (black on white, quiet zone) that reads back the same", async () => {
    const svg = await QRCode.toString("HUB-0042-7781", { type: "svg", ...VENUE_QR_OPTIONS });
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke="#000000"');
    // Rasterised as a gate scanner would see it.
    const raster = await sharp(Buffer.from(svg)).resize(400, 400).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(readQrPixels(jsQR, new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height)).toBe("HUB-0042-7781");
  });

  it("keeps the code's text exactly, and refuses blank, over-long or NUL text", () => {
    expect(cleanVenueCode("  ABC 123\n")).toBe("  ABC 123\n");
    expect(cleanVenueCode("   ")).toBeNull();
    expect(cleanVenueCode(42)).toBeNull();
    expect(cleanVenueCode("x".repeat(VENUE_CODE_MAX))).toHaveLength(VENUE_CODE_MAX);
    expect(cleanVenueCode("x".repeat(VENUE_CODE_MAX + 1))).toBeNull();
    expect(cleanVenueCode("a\u0000b")).toBeNull();
  });

  it("keeps a screenshot on the phone only when its data URL fits", () => {
    expect(fitsOffline(100_000)).toBe(true);
    expect(fitsOffline(Math.floor(((OFFLINE_IMAGE_MAX - 32) / 4) * 3))).toBe(true);
    expect(fitsOffline(230_000)).toBe(false);
    expect(fitsOffline(0)).toBe(false);
  });
});

describe("cleanScreenshot", () => {
  it("keeps a screenshot lossless (PNG), at most 1200px, with no metadata, and its code still reads", async () => {
    const qr = await QRCode.toBuffer("HUB-SCREENSHOT-1", { type: "png", width: 900, margin: 4 });
    const shot = await sharp({ create: { width: 1170, height: 2532, channels: 4, background: "#f4f4f4" } })
      .composite([{ input: qr, top: 800, left: 135 }])
      .png()
      .withExif({ IFD0: { Make: "PhoneCo" } })
      .toBuffer();
    const clean = await cleanScreenshot(new Uint8Array(shot));
    expect(clean?.mime).toBe("image/png");
    const meta = await sharp(clean!.data).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(SCREENSHOT_SIDE);
    expect(meta.exif).toBeUndefined();
    const raw = await sharp(clean!.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(readQrPixels(jsQR, new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height)).toBe("HUB-SCREENSHOT-1");
  });

  it("keeps a JPEG photo a JPEG, never enlarges, and refuses what isn't an image", async () => {
    const jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const out = await cleanScreenshot(new Uint8Array(jpeg));
    const meta = await sharp(out!.data).metadata();
    expect([out?.mime, meta.width, meta.height]).toEqual(["image/jpeg", 300, 200]);
    expect(await cleanScreenshot(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).toBeNull();
  });
});
