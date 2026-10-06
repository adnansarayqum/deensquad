import { describe, expect, it } from "vitest";
import { attachmentTitle, fileTooBig, oversizeFile, readUpload } from "./files";

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
    expect(await readUpload(file([0x25, 0x50, 0x44, 0x46], "big.pdf", 9 * 1024 * 1024))).toEqual({
      ok: false,
      error: "That file is 9.0 MB. The limit is 8 MB. Try a photo or a smaller PDF.",
    });
  });

  it("names the size of a file that's too big, rounded up, before it's sent", () => {
    const MB = 1024 * 1024;
    expect(fileTooBig(9.5 * MB)).toBe("That file is 9.5 MB. The limit is 8 MB. Try a photo or a smaller PDF.");
    expect(fileTooBig(8 * MB + 1)).toBe("That file is 8.1 MB. The limit is 8 MB. Try a photo or a smaller PDF.");

    const form = new FormData();
    form.set("body", "Warm-up: rondos");
    form.set("file", file([0x25], "small.pdf", 8 * MB));
    expect(oversizeFile(form)).toBeNull();
    form.set("file", file([0x25], "scan.pdf", 9.5 * MB));
    expect(oversizeFile(form)?.name).toBe("scan.pdf");
  });
});

describe("what parents see an attachment called", () => {
  it("names the plan or sheet and whether it's a PDF or a photo, never the coach's file name", () => {
    expect(attachmentTitle("plan", { mime: "application/pdf" })).toBe("Session plan (PDF)");
    expect(attachmentTitle("sheet", { mime: "image/jpeg" })).toBe("Practice sheet (photo)");
    expect(attachmentTitle("sheet", { mime: "application/pdf" })).toBe("Practice sheet (PDF)");
  });
});
