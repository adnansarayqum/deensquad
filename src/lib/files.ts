import type { Queryable } from "./db/types";

// Small uploads (session plans, practice sheets): a PDF or a photo, checked by its first bytes
// rather than trusting the name or the browser's type.

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** "That file is 9.5 MB. ..." The size is rounded up, so a file just over the limit never reads as 8.0 MB. */
export function fileTooBig(bytes: number): string {
  const mb = Math.ceil((bytes / (1024 * 1024)) * 10) / 10;
  return `That file is ${mb.toFixed(1)} MB. The limit is 8 MB. Try a photo or a smaller PDF.`;
}

/**
 * The first file in a form that's over the limit, checked in the browser before sending: a file over the Server
 * Action body limit (9 MB, next.config.ts) would otherwise fail the whole request.
 */
export function oversizeFile(formData: FormData): File | null {
  for (const [, value] of formData) {
    if (typeof value !== "string" && value.size > MAX_FILE_BYTES) return value;
  }
  return null;
}

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
  if (value.size > MAX_FILE_BYTES) return { ok: false, error: fileTooBig(value.size) };
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

/**
 * What parents see an attachment called: "Session plan (PDF)", "Practice sheet (photo)". The coach's own file
 * name ("Copy of WhatsApp Image.pdf") is kept for Download only.
 */
export function attachmentTitle(kind: "plan" | "sheet", f: Pick<FileRef, "mime">): string {
  return `${kind === "plan" ? "Session plan" : "Practice sheet"} (${f.mime === "application/pdf" ? "PDF" : "photo"})`;
}

export function fileLabel(f: FileRef): string {
  const kind = f.mime === "application/pdf" ? "PDF" : "Photo";
  const size = f.size >= 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`;
  return `${kind} · ${size}`;
}

// A child's photo for the coaches (Player → a child's details). With JavaScript the browser shrinks it to a
// 512px JPEG before sending (`resized`), so anything over 2 MB then is refused; without, the photo as taken, up to 8 MB.

export const MAX_RESIZED_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PhotoCheck = { ok: true; photo: { mime: string; data: Uint8Array } } | { ok: false; error: string };

export function photoTooBig(bytes: number): string {
  const mb = Math.ceil((bytes / (1024 * 1024)) * 10) / 10;
  return `That photo is ${mb.toFixed(1)} MB. The limit is 8 MB. Try another photo.`;
}

/** Checks a child's photo by its bytes: a JPEG, PNG or WebP, within the size limit. */
export async function readPhoto(value: FormDataEntryValue | null, resized: boolean): Promise<PhotoCheck> {
  if (!value || typeof value === "string" || value.size === 0) return { ok: false, error: "Choose a photo first." };
  const limit = resized ? MAX_RESIZED_PHOTO_BYTES : MAX_FILE_BYTES;
  if (value.size > limit) {
    return { ok: false, error: resized ? "That photo is still too big after shrinking it. Try another one." : photoTooBig(value.size) };
  }
  const data = new Uint8Array(await value.arrayBuffer());
  const mime = sniff(data);
  if (!mime || !(PHOTO_TYPES as readonly string[]).includes(mime)) return { ok: false, error: "Choose a photo (JPEG, PNG or WebP)." };
  return { ok: true, photo: { mime, data } };
}
