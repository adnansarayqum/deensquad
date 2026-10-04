import { describe, expect, it } from "vitest";
import { readUpload } from "./files";

const file = (bytes: number[], name = "x", size?: number) => {
  const f = new File([new Uint8Array(bytes)], name);
  return size ? Object.defineProperty(f, "size", { value: size }) : f;
};

describe("uploads", () => {
  it("accepts PDFs and photos by their contents, not their names", async () => {
    expect(await readUpload(file([0x25, 0x50, 0x44, 0x46, 0x2d], "plan.jpg"))).toMatchObject({ ok: true, upload: { mime: "application/pdf", name: "plan.jpg" } });
    expect(await readUpload(file([0xff, 0xd8, 0xff, 0xe0], "IMG 1.jpeg"))).toMatchObject({ ok: true, upload: { mime: "image/jpeg" } });
    expect(await readUpload(file([0x3c, 0x68, 0x74, 0x6d, 0x6c], "plan.pdf"))).toEqual({ ok: false, error: "Attach a PDF or a photo (JPEG, PNG or WebP)." });
    expect(await readUpload(null)).toEqual({ ok: true, upload: null });
    expect(await readUpload(file([0x25, 0x50, 0x44, 0x46], "big.pdf", 9 * 1024 * 1024))).toMatchObject({ ok: false });
  });
});
