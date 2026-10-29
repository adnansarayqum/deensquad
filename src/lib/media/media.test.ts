// Photos and videos (migration 0038): what's stored is cleaned (no location in pictures or videos), only staff
// upload, a parent opens one only where they can read what it's on, and anything left unattached for a day goes.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import type { Database } from "@/lib/db/types";
import { testDatabase } from "../../../test/db";
import { attachMedia, findMedia, loadMediaFor, orphanedMedia } from "./data";
import { mediaPhrase } from "./limits";
import { sniffMedia } from "./process";
import { runMediaCleanup } from "./run";
import { setMediaStoreForTests } from "./store";
import { receiveMedia } from "./upload";

let t: Awaited<ReturnType<typeof testDatabase>>;
let dir: string;
let admin: string;
let coach: string;
let parent: string;
let other: string;
let adminStaff: string;
let coachStaff: string;
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
})();

const g = globalThis as unknown as { __deenSquadDb?: Promise<Database> };

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  g.__deenSquadDb = Promise.resolve(t.db);
  dir = mkdtempSync(join(tmpdir(), "ds-media-test-"));
  setMediaStoreForTests(dir);
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  parent = await t.signIn(DEV_EMAILS.parent);
  other = await t.signIn("parent14@example.com");
  const staff = await t.asSystem((tx) => tx.query<{ id: string; email: string }>(`select id, email from staff`));
  adminStaff = staff.find((s) => s.email === DEV_EMAILS.admin)!.id;
  coachStaff = staff.find((s) => s.email === DEV_EMAILS.coach)!.id;
});

afterAll(() => {
  g.__deenSquadDb = undefined;
  setMediaStoreForTests(null);
});

/** A JPEG that says where it was taken. */
async function photoWithLocation(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3a7" } })
    .withExif({ IFD0: { Make: "Phone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 33/1 0/1" } })
    .jpeg()
    .toBuffer();
}

const upload = (bytes: Uint8Array, staff: string) => receiveMedia(Readable.from([Buffer.from(bytes)]), staff, bytes.byteLength);

async function news(audience: string[] | null): Promise<string> {
  const [{ id }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`insert into announcements (topic, title, body, audience, requires_ack, posted_by) values ('General', 'Kit', 'Body', $1::text[]::age_group[], false, $2) returning id`, [audience, adminStaff]),
  );
  return id;
}

describe("photos and videos", () => {
  it("knows files by their bytes", () => {
    expect(sniffMedia(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftyp"), ...Buffer.from(brand)]);
    expect(sniffMedia(ftyp("qt  "))?.mime).toBe("video/quicktime");
    expect(sniffMedia(ftyp("isom"))?.mime).toBe("video/mp4");
    expect(sniffMedia(ftyp("heic"))?.mime).toBe("image/heic");
    expect(sniffMedia(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(mediaPhrase(["image", "image", "video"])).toBe("2 photos and a video");
  });

  it("stores a picture upright, at most 2000px, with no location", async () => {
    const result = await upload(await photoWithLocation(), adminStaff);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.media).toMatchObject({ kind: "image", width: 2000, height: 1333 });
    const row = await t.asUser(admin, (tx) => findMedia(tx, result.media.id));
    const meta = await sharp(readFileSync(join(dir, row!.objectKey))).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe("jpeg");
  });

  it("refuses anything that isn't a picture or video", async () => {
    const result = await upload(new TextEncoder().encode("%PDF-1.7 not a photo"), adminStaff);
    expect(result).toMatchObject({ ok: false, status: 415 });
  });

  it.skipIf(!hasFfmpeg)("copies a video without where it was filmed, with a still for the poster", async () => {
    const src = join(dir, "phone.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=1", "-metadata", "location=+51.5074-000.1278/", "-c:v", "mpeg4", src]);
    expect(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "json", src]).toString()).toContain("51.5074");
    const result = await upload(readFileSync(src), adminStaff);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.media).toMatchObject({ kind: "video", width: 320, height: 240, duration: 1, poster: true });
    const row = await t.asUser(admin, (tx) => findMedia(tx, result.media.id));
    const stored = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "json", join(dir, row!.objectKey)]).toString();
    expect(stored).not.toContain("51.5074");
    expect(existsSync(join(dir, row!.posterKey!))).toBe(true);
  });

  it("is seen only where what it's on can be read", async () => {
    const [a, b, c] = await Promise.all([upload(await photoWithLocation(), adminStaff), upload(await photoWithLocation(), adminStaff), upload(await photoWithLocation(), adminStaff)]);
    if (!a.ok || !b.ok || !c.ok) throw new Error("upload failed");
    // Not attached yet: staff only.
    expect(await t.asUser(parent, (tx) => findMedia(tx, a.media.id))).toBeNull();
    expect(await t.asUser(coach, (tx) => findMedia(tx, a.media.id))).not.toBeNull();

    const forU7 = await news(["U7"]);
    const forU12 = await news(["U12"]);
    expect(await t.asUser(admin, (tx) => attachMedia(tx, "announcement", forU7, [a.media.id], adminStaff))).toBeNull();
    expect(await t.asUser(admin, (tx) => attachMedia(tx, "announcement", forU12, [b.media.id], adminStaff))).toBeNull();
    // Adnan has Musa in U7, nobody in U12.
    expect(await t.asUser(parent, (tx) => findMedia(tx, a.media.id))).not.toBeNull();
    expect(await t.asUser(parent, (tx) => findMedia(tx, b.media.id))).toBeNull();
    expect((await t.asUser(parent, (tx) => loadMediaFor(tx, "announcement", [forU7, forU12]))).get(forU12)).toBeUndefined();

    // Attached once only, and only by whoever uploaded it.
    expect(await t.asUser(admin, (tx) => attachMedia(tx, "announcement", forU12, [a.media.id], adminStaff))).toMatch(/gone/);
    expect(await t.asUser(coach, (tx) => attachMedia(tx, "announcement", forU12, [c.media.id], coachStaff))).toMatch(/gone/);

    // A message about Yusuf: his parents see the picture, another family doesn't.
    const messageId = await t.asUser(admin, async (tx) => {
      const [{ id: conversation }] = await tx.query<{ id: string }>(
        `insert into conversations (player_id, started_by_user, started_by_kind, staff_id) values ($1, auth.uid(), 'staff', $2) returning id`,
        [DEV_IDS.yusuf, adminStaff],
      );
      const [{ id }] = await tx.query<{ id: string }>(
        `insert into conversation_messages (conversation_id, author_user, author_kind, author_name, body) values ($1, auth.uid(), 'staff', '', 'Sent a photo.') returning id`,
        [conversation],
      );
      expect(await attachMedia(tx, "message", id, [c.media.id], adminStaff)).toBeNull();
      return id;
    });
    expect(await t.asUser(parent, (tx) => findMedia(tx, c.media.id))).not.toBeNull();
    expect(await t.asUser(other, (tx) => findMedia(tx, c.media.id))).toBeNull();
    expect((await t.asUser(parent, (tx) => loadMediaFor(tx, "message", [messageId]))).get(messageId)?.map((m) => m.id)).toEqual([c.media.id]);

    // Parents can't attach anything themselves.
    await expect(t.asUser(parent, (tx) => tx.query(`insert into announcement_media (announcement_id, media_id, position) values ($1, $2, 1)`, [forU12, c.media.id]))).rejects.toThrow();
  });

  it("a session's list replaces what it had; unattached uploads go after a day", async () => {
    const [x, y] = await Promise.all([upload(await photoWithLocation(), coachStaff), upload(await photoWithLocation(), coachStaff)]);
    if (!x.ok || !y.ok) throw new Error("upload failed");
    const [s] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where 'U7' = any (age_groups::text[]) order by starts_at limit 1`));
    expect(await t.asUser(coach, (tx) => attachMedia(tx, "session", s.id, [x.media.id, y.media.id], coachStaff))).toBeNull();
    expect(await t.asUser(parent, (tx) => findMedia(tx, y.media.id))).not.toBeNull();
    // Saved again with only y, then y first: x comes off.
    expect(await t.asUser(coach, (tx) => attachMedia(tx, "session", s.id, [y.media.id], coachStaff))).toBeNull();
    expect((await t.asUser(parent, (tx) => loadMediaFor(tx, "session", [s.id]))).get(s.id)?.map((m) => m.id)).toEqual([y.media.id]);

    const later = new Date(Date.now() + 25 * 3600_000);
    const orphans = await t.asSystem((tx) => orphanedMedia(tx, later));
    expect(orphans.map((o) => o.id)).toContain(x.media.id);
    expect(orphans.map((o) => o.id)).not.toContain(y.media.id);
    const xKey = (await t.asUser(admin, (tx) => findMedia(tx, x.media.id)))!.objectKey;
    const result = await runMediaCleanup(later);
    expect(result.failed).toBe(0);
    expect(await t.asUser(admin, (tx) => findMedia(tx, x.media.id))).toBeNull();
    expect(existsSync(join(dir, xKey))).toBe(false);
    expect(await t.asUser(admin, (tx) => findMedia(tx, y.media.id))).not.toBeNull();
  });
});
