import "server-only";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { IMAGE_SIDE } from "./limits";

const run = promisify(execFile);

// Turns an upload into what's stored. Pictures: upright, at most 2000px, JPEG, no metadata (a phone's GPS location
// never reaches the club). Videos: copied into a fresh file by ffmpeg without re-encoding (`-c copy`), keeping only
// the first picture and sound tracks and dropping every bit of metadata (an iPhone video carries where it was filmed),
// with the index moved to the front so it starts playing before it has all downloaded; plus a still for the poster.

export type Sniffed = { kind: "image"; mime: "image/jpeg" | "image/png" | "image/webp" | "image/heic" } | { kind: "video"; mime: "video/mp4" | "video/quicktime" | "video/webm" };

/** What the first bytes say the file is (never the name or the browser's type). */
export function sniffMedia(b: Uint8Array): Sniffed | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, j) => b[i + j] === v);
  const text = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (at(0, 0xff, 0xd8, 0xff)) return { kind: "image", mime: "image/jpeg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { kind: "image", mime: "image/png" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { kind: "image", mime: "image/webp" };
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return { kind: "video", mime: "video/webm" };
  if (b.length >= 12 && text(4, 4) === "ftyp") {
    const brand = text(8, 4);
    if (["heic", "heix", "hevc", "mif1", "msf1", "avif"].includes(brand)) return { kind: "image", mime: "image/heic" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime" };
    return { kind: "video", mime: "video/mp4" };
  }
  return null;
}

export async function readHead(path: string, n = 32): Promise<Uint8Array> {
  const f = await open(path, "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await f.read(buf, 0, n, 0);
    return new Uint8Array(buf.subarray(0, bytesRead));
  } finally {
    await f.close();
  }
}

/** A clean JPEG and its size, or null when sharp can't read it (HEIC from a computer, a broken file). */
export async function cleanImage(data: Uint8Array, side = IMAGE_SIDE): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const { data: out, info } = await sharp(data, { limitInputPixels: 80_000_000, failOn: "error" })
      .rotate()
      .resize(side, side, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(out), width: info.width, height: info.height };
  } catch {
    return null;
  }
}

const FFMPEG = () => process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const FFPROBE = () => process.env.FFPROBE_PATH?.trim() || "ffprobe";

let ffmpegOk: Promise<boolean> | null = null;
/** Whether ffmpeg is installed here (railpack.json adds it on Railway). Without it videos are refused, not kept with
 * their metadata. */
export function canProcessVideo(): Promise<boolean> {
  ffmpegOk ??= Promise.all([run(FFMPEG(), ["-version"]), run(FFPROBE(), ["-version"])]).then(
    () => true,
    () => false,
  );
  return ffmpegOk;
}

type Probe = { width: number; height: number; duration: number | null; codec: string };

async function probe(path: string): Promise<Probe | null> {
  try {
    const { stdout } = await run(
      FFPROBE(),
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name:stream_side_data=rotation:format=duration", "-of", "json", path],
      { timeout: 30_000 },
    );
    const j = JSON.parse(stdout) as {
      streams?: { width?: number; height?: number; codec_name?: string; side_data_list?: { rotation?: number }[] }[];
      format?: { duration?: string };
    };
    const v = j.streams?.[0];
    if (!v?.width || !v.height || !v.codec_name) return null;
    const rotation = Math.abs(Number(v.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0)) % 180;
    const duration = j.format?.duration ? Number(j.format.duration) : null;
    return {
      width: rotation === 90 ? v.height : v.width,
      height: rotation === 90 ? v.width : v.height,
      duration: duration !== null && Number.isFinite(duration) ? duration : null,
      codec: v.codec_name,
    };
  } catch {
    return null;
  }
}

export type CleanVideo = {
  path: string;
  poster: Uint8Array | null;
  width: number;
  height: number;
  duration: number | null;
  done: () => Promise<void>;
};

/**
 * The video copied without its metadata, a poster still and its size, or null when it isn't a video ffmpeg can read.
 * `done` removes the temporary files.
 */
export async function cleanVideo(input: string, mime: "video/mp4" | "video/quicktime" | "video/webm"): Promise<CleanVideo | null> {
  const base = join(tmpdir(), `ds-media-${crypto.randomUUID()}`);
  const ext = mime === "video/webm" ? "webm" : mime === "video/quicktime" ? "mov" : "mp4";
  const out = `${base}.${ext}`;
  const still = `${base}.jpg`;
  const done = async () => {
    await rm(out, { force: true });
    await rm(still, { force: true });
  };
  try {
    const info = await probe(input);
    if (!info) return null;
    await run(
      FFMPEG(),
      [
        "-v", "error", "-y", "-i", input,
        "-map", "0:v:0", "-map", "0:a:0?", "-dn", "-sn",
        "-map_metadata", "-1", "-map_chapters", "-1",
        "-c", "copy",
        ...(ext === "webm" ? [] : ["-movflags", "+faststart"]),
        out,
      ],
      { timeout: 120_000 },
    );
    let poster: Uint8Array | null = null;
    for (const at of ["0.5", "0"]) {
      try {
        await run(FFMPEG(), ["-v", "error", "-y", "-ss", at, "-i", out, "-frames:v", "1", "-q:v", "3", still], { timeout: 60_000 });
        const cleaned = await cleanImage(new Uint8Array(await readFile(still)), 1280);
        if (cleaned) {
          poster = cleaned.data;
          break;
        }
      } catch {
        // A very short clip has no frame at 0.5s; try the first.
      }
    }
    return { path: out, poster, width: info.width, height: info.height, duration: info.duration, done };
  } catch {
    await done();
    return null;
  }
}

export { createReadStream };
