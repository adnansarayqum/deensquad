import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cleanLogo, cleanPhoto, PHOTO_SIDE } = await import("./photo-clean");

describe("cleanPhoto", () => {
  it("drops EXIF (GPS included), shrinks to 512px and returns a JPEG", async () => {
    const tagged = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#2a6" } })
      .jpeg()
      .withExif({ IFD0: { Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 34/1 0/1" } })
      .toBuffer();
    expect((await sharp(tagged).metadata()).exif).toBeDefined();

    const clean = await cleanPhoto(new Uint8Array(tagged));
    expect(clean?.mime).toBe("image/jpeg");
    const meta = await sharp(clean!.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(PHOTO_SIDE);
    expect(Buffer.from(clean!.data).includes(Buffer.from("PhoneCo"))).toBe(false);
  });

  it("re-encodes PNG and WebP as JPEG and never enlarges a small photo", async () => {
    const png = await sharp({ create: { width: 100, height: 80, channels: 4, background: "#00000000" } }).png().toBuffer();
    const out = await cleanPhoto(new Uint8Array(png));
    const meta = await sharp(out!.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 100, 80]);
    const webp = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#fff" } }).webp().toBuffer();
    expect((await cleanPhoto(new Uint8Array(webp)))?.mime).toBe("image/jpeg");
  });

  it("returns null for bytes that only look like an image", async () => {
    expect(await cleanPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))).toBeNull();
  });
});

describe("cleanLogo", () => {
  it("reads the logo's own ground colour, so a dark logo's tile can match it", async () => {
    const navy = await sharp({ create: { width: 900, height: 500, channels: 3, background: "#10294a" } }).png().toBuffer();
    const logo = await cleanLogo(new Uint8Array(navy));
    expect(logo?.bg).toBe("#10294a");
    expect((await sharp(logo!.data).metadata()).width).toBe(600);
    // A see-through logo is flattened onto white, and a small icon is kept small.
    const clear = await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const icon = await cleanLogo(new Uint8Array(clear), 256);
    expect(icon?.bg).toBe("#ffffff");
    expect((await sharp(icon!.data).metadata()).width).toBe(256);
    expect(await cleanLogo(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
