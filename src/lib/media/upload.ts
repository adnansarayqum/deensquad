import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { asSystem } from "../db";
import { insertMedia, type MediaItem } from "./data";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, imageTooBig, videoTooBig } from "./limits";
import { canProcessVideo, cleanImage, cleanVideo, readHead, sniffMedia } from "./process";
import { mediaStore } from "./store";

// One picture or video from a member of staff: saved to a temporary file (never held whole in memory), checked by
// its bytes, cleaned (process.ts), put in the store and recorded. Used by POST /api/media (the picker, any size up
// to the limits) and by forms sent without JavaScript (each file in the form, within the 9 MB action limit).

export type UploadResult = { ok: true; media: MediaItem } | { ok: false; status: number; error: string };

export const NOT_SET_UP = "Photos and videos aren't set up yet. Ask the club's admin.";
const NOT_MEDIA = "Choose a photo (JPEG, PNG or WebP) or a video (MP4, MOV or WebM).";

class TooBig extends Error {}

/** Writes `body` to a temporary file, stopping once it passes `limit` bytes. */
async function toTempFile(body: Readable, limit: number): Promise<{ path: string; bytes: number }> {
  const path = join(tmpdir(), `ds-upload-${crypto.randomUUID()}`);
  let bytes = 0;
  const count = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > limit) cb(new TooBig());
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(body, count, createWriteStream(path));
  } catch (e) {
    await rm(path, { force: true });
    throw e;
  }
  return { path, bytes };
}

export async function receiveMedia(body: Readable, staffId: string, declaredBytes: number | null): Promise<UploadResult> {
  const store = mediaStore();
  if (!store) return { ok: false, status: 503, error: NOT_SET_UP };
  if (declaredBytes !== null && declaredBytes > MAX_VIDEO_BYTES) return { ok: false, status: 413, error: videoTooBig(declaredBytes) };
  let file: { path: string; bytes: number };
  try {
    file = await toTempFile(body, MAX_VIDEO_BYTES);
  } catch (e) {
    if (e instanceof TooBig) return { ok: false, status: 413, error: videoTooBig(declaredBytes ?? MAX_VIDEO_BYTES + 1) };
    return { ok: false, status: 400, error: "The upload stopped part way. Check your signal and try again." };
  }
  try {
    if (file.bytes === 0) return { ok: false, status: 400, error: NOT_MEDIA };
    const sniffed = sniffMedia(await readHead(file.path));
    if (!sniffed) return { ok: false, status: 415, error: NOT_MEDIA };
    const id = crypto.randomUUID();

    if (sniffed.kind === "image") {
      if (file.bytes > MAX_IMAGE_BYTES) return { ok: false, status: 413, error: imageTooBig(file.bytes) };
      const clean = await cleanImage(new Uint8Array(await readFile(file.path)));
      if (!clean) {
        return {
          ok: false,
          status: 415,
          error: sniffed.mime === "image/heic" ? "That photo is in HEIC format. Send it from your phone, or save it as a JPEG first." : NOT_MEDIA,
        };
      }
      const key = `media/${id}.jpg`;
      await store.put(key, clean.data, "image/jpeg");
      return saved(key, null, { kind: "image", mime: "image/jpeg", bytes: clean.data.byteLength, width: clean.width, height: clean.height, duration: null }, staffId);
    }

    if (!(await canProcessVideo())) return { ok: false, status: 503, error: "Videos aren't set up yet. Photos work. Ask the club's admin." };
    const video = await cleanVideo(file.path, sniffed.mime);
    if (!video) return { ok: false, status: 415, error: "That video couldn't be read. Try another one, or send it as MP4." };
    try {
      const ext = sniffed.mime === "video/webm" ? "webm" : sniffed.mime === "video/quicktime" ? "mov" : "mp4";
      const key = `media/${id}.${ext}`;
      const posterKey = video.poster ? `media/${id}-poster.jpg` : null;
      await store.put(key, createReadStream(video.path), sniffed.mime);
      if (posterKey && video.poster) await store.put(posterKey, video.poster, "image/jpeg");
      const { size } = await stat(video.path);
      return saved(key, posterKey, { kind: "video", mime: sniffed.mime, bytes: size, width: video.width, height: video.height, duration: video.duration }, staffId);
    } finally {
      await video.done();
    }
  } finally {
    await rm(file.path, { force: true });
  }
}

async function saved(
  objectKey: string,
  posterKey: string | null,
  m: { kind: "image" | "video"; mime: string; bytes: number; width: number; height: number; duration: number | null },
  staffId: string,
): Promise<UploadResult> {
  const id = await asSystem((tx) => insertMedia(tx, { ...m, objectKey, posterKey, uploadedBy: staffId }));
  return {
    ok: true,
    media: { id, kind: m.kind, width: m.width, height: m.height, duration: m.duration === null ? null : Math.round(m.duration), poster: posterKey !== null },
  };
}

/**
 * Forms sent without JavaScript: every file in the `mediaFile` field, stored as above. Returns their ids, or the
 * first problem. (With JavaScript the picker uploads each one as it's chosen and the form carries only ids.)
 */
export async function receiveFormMedia(formData: FormData, staffId: string): Promise<{ ids: string[] } | { error: string }> {
  const ids: string[] = [];
  for (const value of formData.getAll("mediaFile")) {
    if (typeof value === "string" || value.size === 0) continue;
    const result = await receiveMedia(Readable.fromWeb(value.stream() as import("node:stream/web").ReadableStream), staffId, value.size);
    if (!result.ok) return { error: result.error };
    ids.push(result.media.id);
  }
  return { ids };
}
