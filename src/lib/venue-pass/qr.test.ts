import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { cleanVenueCode, fitsOffline, highContrast, OFFLINE_IMAGE_MAX, readQrAnyWay, readQrPixels, readSides, VENUE_CODE_MAX } from "./qr";
import { QR_OPTIONS, qrDataUrl } from "../qr-picture";

vi.mock("server-only", () => ({}));
const { cleanScreenshot, SCREENSHOT_SIDE } = await import("../photo-clean");
const { readQrFromImage } = await import("./read-server");

/** A QR code drawn as RGBA pixels, `scale` pixels a module, the way it's drawn with QR_OPTIONS (quiet zone included). */
function pixels(text: string, scale = 4, invert = false) {
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel });
  const n = qr.modules.size;
  const side = (n + 2 * QR_OPTIONS.margin) * scale;
  const out = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / scale) - QR_OPTIONS.margin;
      const my = Math.floor(y / scale) - QR_OPTIONS.margin;
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

  it("draws the code back as a picture (black on white, quiet zone) that reads back the same", async () => {
    const url = await qrDataUrl("HUB-0042-7781");
    // Scaled up as the phone shows it.
    const raster = await sharp(Buffer.from(url.split(",")[1], "base64"))
      .resize(400, 400, { kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
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

/** A made-up printed ticket: the code in mid-greys on grey paper, with a shadow across it, as a phone photo shows it. */
function ticketPhoto(text: string, scale: number) {
  const { data, side } = pixels(text, scale);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      const shade = 1 - 0.45 * (x / side); // darker towards the right, like a hand's shadow
      const v = (data[i] === 0 ? 70 : 190) * shade;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  }
  return { data, side };
}

describe("reading a photo of a printed code", () => {
  it("tries the picture's own size and then smaller ones, never larger", () => {
    expect(readSides(3000)).toEqual([1600, 1000, 700, 500, 350]);
    expect(readSides(800)).toEqual([800, 700, 500, 350]);
    expect(readSides(200)).toEqual([200]);
  });

  it("evens out an unevenly lit grey code into black and white", () => {
    const out = highContrast(new Uint8ClampedArray([40, 40, 40, 255, 200, 200, 200, 255]));
    expect([...out]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it("reads a shadowed grey code in high contrast", () => {
    const { data, side } = ticketPhoto("IND000000", 6);
    expect(readQrAnyWay(jsQR, data, side, side)).toBe("IND000000");
  });

  it("on the server, reads a code from an uploaded photo so it can be kept as text", async () => {
    const { data, side } = ticketPhoto("IND123456", 40); // a big photo: about 1500px
    const png = new Uint8Array(await sharp(Buffer.from(data), { raw: { width: side, height: side, channels: 4 } }).jpeg({ quality: 80 }).toBuffer());
    expect(await readQrFromImage(png)).toBe("IND123456");
    const blank = new Uint8Array(await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ddd" } }).png().toBuffer());
    expect(await readQrFromImage(blank)).toBeNull();
    expect(await readQrFromImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
