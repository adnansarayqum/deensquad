import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import { middleSquare, readCode, READ_SIZE, type Decode } from "./reader";

// The reader with pictures, no camera. A code as the app draws it (qr-picture.ts: level M) on a phone-sized white
// card in a dark picture, then changed the ways it reaches a camera at the gate.

const TOKEN = "DSP.0B5C2F6E8A1D4C7F9E2A3B4C5D6E7F80.ABCDEFGHJKMNPQRS";
const decode = jsQR as unknown as Decode;

async function picture(edit: (img: Sharp) => Sharp = (img) => img, size = READ_SIZE): Promise<Uint8ClampedArray> {
  const code = await QRCode.toBuffer(TOKEN, { errorCorrectionLevel: "M", margin: 4, width: Math.round(size * 0.5) });
  const base = sharp({ create: { width: size, height: size, channels: 3, background: { r: 24, g: 26, b: 30 } } }).composite([{ input: code, gravity: "centre" }]).png();
  const flat = sharp(await base.toBuffer());
  const { data } = await edit(flat).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
}

/** Reads two pictures in a row (an ordinary pass and a light-on-dark one), as the scanner's loop does. */
const readEither = (pixels: Uint8ClampedArray, size = READ_SIZE) => readCode(decode, pixels.slice(), size, 1).code ?? readCode(decode, pixels.slice(), size, 2).code;

describe("reading a code from a picture", () => {
  it("reads a clear code, a dim one, a blurred one and one washed out by glare", async () => {
    expect(readEither(await picture())).toBe(TOKEN);
    expect(readEither(await picture((img) => img.linear(0.55, 0)))).toBe(TOKEN);
    expect(readEither(await picture((img) => img.blur(1.2)))).toBe(TOKEN);
    expect(readEither(await picture((img) => img.linear(0.6, 95)))).toBe(TOKEN);
  });

  it("reads a light-on-dark code only on its own pass, so each picture costs one pass", async () => {
    const inverted = await picture((img) => img.negate({ alpha: false }));
    expect(readCode(decode, inverted.slice(), READ_SIZE, 1)).toEqual({ code: null, skipped: null });
    expect(readCode(decode, inverted.slice(), READ_SIZE, 2)).toEqual({ code: TOKEN, skipped: null });
    const plain = await picture();
    expect(readCode(decode, plain.slice(), READ_SIZE, 1)).toEqual({ code: TOKEN, skipped: null });
    // An ordinary code isn't found on the light-on-dark pass, and that pass doesn't throw (jsQR's own "onlyInvert" does).
    expect(readCode(decode, plain.slice(), READ_SIZE, 2)).toEqual({ code: null, skipped: null });
    expect(() => (jsQR as unknown as (d: Uint8ClampedArray, w: number, h: number, o: { inversionAttempts: string }) => unknown)(plain.slice(), READ_SIZE, READ_SIZE, { inversionAttempts: "onlyInvert" })).toThrow();
  });

  it("finds nothing in a picture with no code, or in noise", async () => {
    const blank = new Uint8ClampedArray(READ_SIZE * READ_SIZE * 4).fill(40);
    expect(readEither(blank)).toBeNull();
    const noise = new Uint8ClampedArray(READ_SIZE * READ_SIZE * 4);
    let seed = 7;
    for (let i = 0; i < noise.length; i++) noise[i] = (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255;
    expect(readEither(noise)).toBeNull();
  });

  it("never throws when the decoder does: the picture is skipped and the reason kept", () => {
    const throwing: Decode = () => {
      throw new RangeError("Maximum call stack size exceeded");
    };
    expect(readCode(throwing, new Uint8ClampedArray(16), 2, 2)).toEqual({ code: null, skipped: "Maximum call stack size exceeded" });
    const odd: Decode = () => ({ data: "" });
    expect(readCode(odd, new Uint8ClampedArray(16), 2, 1)).toEqual({ code: null, skipped: null });
  });

  it("takes the middle square of the camera's picture, never enlarged", () => {
    expect(middleSquare(1280, 720)).toEqual({ x: 280, y: 0, side: 720, size: 640 });
    expect(middleSquare(480, 640)).toEqual({ x: 0, y: 80, side: 480, size: 480 });
    expect(middleSquare(0, 0)).toBeNull();
  });
});
