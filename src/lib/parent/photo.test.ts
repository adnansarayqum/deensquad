// A child's photo for the coaches (migration 0023), run as different signed-in people on PGlite with the sample club:
// only the child's own parents add it, only with photo consent; only staff and those parents can open the file; and
// it never outlives a replace, a removal, consent turned off or the child being removed.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import type { Queryable } from "@/lib/db/types";
import { testDatabase } from "../../../test/db";
import { MAX_FILE_BYTES, MAX_RESIZED_PHOTO_BYTES, readPhoto } from "../files";
import { removeChildRecord } from "../admin/remove";
import { clearMyChildPhoto, loadMyChild, setMyChildPhoto } from "./profile";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf (U10) and Musa (U7)
let sara: string; // Adnan's co-parent
let other: string; // parent of one U10 child, nobody else's
let coach: string;
let admin: string;

const jpeg = (n = 1) => ({ mime: "image/jpeg", data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 0, 0, 0]) });
/** What /api/files/[id] runs, as this person: a row, or nothing (a 404). */
const open = (user: string, file: string) => t.asUser(user, (tx) => tx.query(`select name, mime from club_files where id = $1`, [file]));
const fileExists = async (file: string) => (await t.asSystem((tx) => tx.query(`select 1 from club_files where id = $1`, [file]))).length === 1;
const photoOf = async (child: string) =>
  (await t.asSystem((tx) => tx.query<{ photo_file_id: string | null; photo_updated_at: Date | null }>(`select photo_file_id, photo_updated_at from players where id = $1`, [child])))[0];
const consent = (child: string, value: boolean | null) =>
  t.asSystem((tx: Queryable) => tx.query(`update players set photo_consent = $2, photo_file_id = null where id = $1`, [child, value]));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  other = await t.signIn("parent1@example.com");
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
});

beforeEach(async () => {
  await consent(DEV_IDS.yusuf, true);
});

describe("adding a photo", () => {
  it("is refused without photo consent (unanswered or no)", async () => {
    await consent(DEV_IDS.yusuf, null);
    await expect(t.asUser(adnan, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg()))).rejects.toThrow(/no photo consent/);
    await consent(DEV_IDS.yusuf, false);
    await expect(t.asUser(adnan, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg()))).rejects.toThrow(/no photo consent/);
    expect((await photoOf(DEV_IDS.yusuf)).photo_file_id).toBeNull();
  });

  it("is refused for someone else's child, and for staff who aren't the child's parent", async () => {
    await expect(t.asUser(other, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg()))).rejects.toThrow(/not allowed/);
    await expect(t.asUser(coach, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg()))).rejects.toThrow(/not allowed/);
  });

  it("refuses anything but a JPEG, PNG or WebP", async () => {
    await expect(t.asUser(adnan, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, { mime: "application/pdf", data: new Uint8Array([1]) }))).rejects.toThrow(
      /invalid photo/,
    );
  });

  it("with consent: the child's parents and staff can open it; another parent gets nothing", async () => {
    const file = await t.asUser(adnan, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg()));
    const row = await photoOf(DEV_IDS.yusuf);
    expect(row.photo_file_id).toBe(file);
    expect(row.photo_updated_at).not.toBeNull();
    expect(await t.asUser(adnan, (tx) => loadMyChild(tx, DEV_IDS.yusuf))).toMatchObject({ photoId: file, photoConsent: true });

    expect(await open(adnan, file)).toHaveLength(1);
    expect(await open(sara, file)).toHaveLength(1); // the other parent of the same child
    expect(await open(coach, file)).toHaveLength(1);
    expect(await open(admin, file)).toHaveLength(1);
    expect(await open(other, file)).toHaveLength(0);
    // Nor can another parent see it on the child's row.
    expect(await t.asUser(other, (tx) => tx.query(`select photo_file_id from players where id = $1`, [DEV_IDS.yusuf]))).toHaveLength(0);
  });

  it("replacing it deletes the old file", async () => {
    const first = await t.asUser(adnan, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg(1)));
    const second = await t.asUser(sara, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg(2)));
    expect(second).not.toBe(first);
    expect(await fileExists(first)).toBe(false);
    expect(await fileExists(second)).toBe(true);
    expect((await photoOf(DEV_IDS.yusuf)).photo_file_id).toBe(second);
  });
});

describe("taking a photo off", () => {
  it("Remove photo deletes the file", async () => {
    const file = await t.asUser(adnan, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg()));
    await expect(t.asUser(other, (tx) => clearMyChildPhoto(tx, DEV_IDS.yusuf))).rejects.toThrow(/not allowed/);
    expect(await fileExists(file)).toBe(true);
    await t.asUser(adnan, (tx) => clearMyChildPhoto(tx, DEV_IDS.yusuf));
    expect(await photoOf(DEV_IDS.yusuf)).toEqual({ photo_file_id: null, photo_updated_at: null });
    expect(await fileExists(file)).toBe(false);
  });

  it("turning photo consent off deletes the photo and its file; saying yes again keeps it", async () => {
    const file = await t.asUser(adnan, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg()));
    await t.asUser(adnan, (tx) => tx.query(`select set_photo_consent($1, true)`, [DEV_IDS.yusuf]));
    expect((await photoOf(DEV_IDS.yusuf)).photo_file_id).toBe(file);
    await t.asUser(adnan, (tx) => tx.query(`select set_photo_consent($1, false)`, [DEV_IDS.yusuf]));
    expect(await photoOf(DEV_IDS.yusuf)).toEqual({ photo_file_id: null, photo_updated_at: null });
    expect(await fileExists(file)).toBe(false);
    const [row] = await t.asSystem((tx) => tx.query<{ photo_consent: boolean }>(`select photo_consent from players where id = $1`, [DEV_IDS.yusuf]));
    expect(row.photo_consent).toBe(false);
  });

  it("the database never keeps a photo without consent", async () => {
    const file = await t.asUser(adnan, (tx) => setMyChildPhoto(tx, DEV_IDS.yusuf, jpeg()));
    await expect(t.asSystem((tx) => tx.query(`update players set photo_consent = false where id = $1`, [DEV_IDS.yusuf]))).rejects.toThrow(
      /players_photo_needs_consent/,
    );
    expect(await fileExists(file)).toBe(true);
  });

  it("removing the child deletes their photo file", async () => {
    const [{ id: child }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `select p.id from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id where g.email = 'parent1@example.com'`,
      ),
    );
    await t.asSystem((tx) => tx.query(`update players set photo_consent = true where id = $1`, [child]));
    const file = await t.asUser(other, (tx) => setMyChildPhoto(tx, child, jpeg()));
    await t.asUser(admin, (tx) => removeChildRecord(tx, child));
    expect(await fileExists(file)).toBe(false);
  });
});

describe("readPhoto", () => {
  const blob = (bytes: number[], size?: number) => {
    const data = new Uint8Array(size ?? bytes.length);
    data.set(bytes);
    return new File([data], "x");
  };
  const JPEG = [0xff, 0xd8, 0xff, 0xe0];
  const PNG = [0x89, 0x50, 0x4e, 0x47];
  const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

  it("takes a JPEG, PNG or WebP by its bytes, whatever its name", async () => {
    expect(await readPhoto(blob(JPEG), true)).toMatchObject({ ok: true, photo: { mime: "image/jpeg" } });
    expect(await readPhoto(blob(PNG), false)).toMatchObject({ ok: true, photo: { mime: "image/png" } });
    expect(await readPhoto(blob(WEBP), false)).toMatchObject({ ok: true, photo: { mime: "image/webp" } });
  });

  it("refuses a PDF, anything else and no file", async () => {
    expect(await readPhoto(blob([0x25, 0x50, 0x44, 0x46]), false)).toEqual({ ok: false, error: "Choose a photo (JPEG, PNG or WebP)." });
    expect(await readPhoto(blob([1, 2, 3, 4]), false)).toEqual({ ok: false, error: "Choose a photo (JPEG, PNG or WebP)." });
    expect(await readPhoto(null, false)).toEqual({ ok: false, error: "Choose a photo first." });
    expect(await readPhoto(new File([], "x"), false)).toEqual({ ok: false, error: "Choose a photo first." });
  });

  it("caps a shrunk photo at 2 MB and one sent as taken (no JavaScript) at 8 MB", async () => {
    expect(await readPhoto(blob(JPEG, MAX_RESIZED_PHOTO_BYTES + 1), true)).toEqual({
      ok: false,
      error: "That photo is still too big after shrinking it. Try another one.",
    });
    expect(await readPhoto(blob(JPEG, MAX_RESIZED_PHOTO_BYTES + 1), false)).toMatchObject({ ok: true });
    expect(await readPhoto(blob(JPEG, MAX_FILE_BYTES + 1), false)).toEqual({ ok: false, error: "That photo is 8.1 MB. The limit is 8 MB. Try another photo." });
  });
});
