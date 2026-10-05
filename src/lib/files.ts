import type { Queryable } from "./db/types";

// Small uploads (session plans, practice sheets): a PDF or a photo, checked by its first bytes
// rather than trusting the name or the browser's type.

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export type Upload = { name: string; mime: string; data: Uint8Array };
export type UploadCheck = { ok: true; upload: Upload | null } | { ok: false; error: string };

export function sniff(b: Uint8Array): string | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, j) => b[i + j] === v);
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // RIFF....WEBP
  return null;
}

/** Reads an optional file field. No file chosen is fine (upload: null). */
export async function readUpload(value: FormDataEntryValue | null): Promise<UploadCheck> {
  if (!value || typeof value === "string" || value.size === 0) return { ok: true, upload: null };
  if (value.size > MAX_FILE_BYTES) return { ok: false, error: "That file is too big. Keep it under 8 MB." };
  const data = new Uint8Array(await value.arrayBuffer());
  const mime = sniff(data);
  if (!mime) return { ok: false, error: "Attach a PDF or a photo (JPEG, PNG or WebP)." };
  const name = (value.name || "attachment").replace(/[^\w.\- ]+/g, "").slice(0, 100) || "attachment";
  return { ok: true, upload: { name, mime, data } };
}

export async function saveFile(tx: Queryable, upload: Upload, staffId: string | null): Promise<string> {
  const [{ id }] = await tx.query<{ id: string }>(
    `insert into club_files (name, mime, size, data, uploaded_by) values ($1, $2, $3, $4, $5) returning id`,
    [upload.name, upload.mime, upload.data.byteLength, upload.data, staffId],
  );
  return id;
}

export type FileRef = { id: string; name: string; mime: string; size: number };

export function fileLabel(f: FileRef): string {
  const kind = f.mime === "application/pdf" ? "PDF" : "Photo";
  const size = f.size >= 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`;
  return `${kind} · ${size}`;
}
