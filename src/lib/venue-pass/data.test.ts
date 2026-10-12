// A parent's own sports hub entry code (migration 0024), run as different signed-in people on PGlite with the sample
// club: only that parent reads or writes it (not their co-parent, not other parents, not staff), its screenshot file
// opens for them alone, and a replaced or removed screenshot (or a deleted parent) leaves no file behind.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { saveFile } from "../files";
import { buildFamilyExport } from "../parent/export";
import { clearMyVenuePass, loadMyVenuePass, setMyVenuePassImage, setMyVenuePassText } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf and Musa
let sara: string; // Adnan's co-parent: the code is Adnan's own, so not hers
let other: string;
let coach: string;
let admin: string;

const png = (n = 1) => ({ mime: "image/png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, n, 0, 0, 0]) });
/** What /api/files/[id] runs, as this person: a row, or nothing (a 404). */
const open = (user: string, file: string) => t.asUser(user, (tx) => tx.query(`select id from club_files where id = $1`, [file]));
const fileExists = async (file: string) => (await t.asSystem((tx) => tx.query(`select 1 from club_files where id = $1`, [file]))).length === 1;
const rows = () => t.asSystem((tx) => tx.query<{ guardian_id: string; code_text: string | null; image_file_id: string | null }>(`select * from guardian_venue_passes`));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  other = await t.signIn("parent1@example.com");
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
});

beforeEach(async () => {
  await t.asSystem((tx) => tx.query(`delete from guardian_venue_passes`));
});

describe("the code's text", () => {
  it("is the parent's alone: their co-parent, other parents and staff read nothing", async () => {
    await t.asUser(adnan, (tx) => setMyVenuePassText(tx, "HUB-ADNAN-1"));
    expect(await t.asUser(adnan, loadMyVenuePass)).toMatchObject({ text: "HUB-ADNAN-1", imageId: null });
    expect(await t.asUser(sara, loadMyVenuePass)).toBeNull();
    for (const someone of [sara, other, coach, admin]) {
      expect(await t.asUser(someone, (tx) => tx.query(`select * from guardian_venue_passes`))).toEqual([]);
    }
  });

  it("is refused blank, over 1000 characters, or for staff with no parent account", async () => {
    await expect(t.asUser(adnan, (tx) => setMyVenuePassText(tx, "  "))).rejects.toThrow(/invalid code/);
    await expect(t.asUser(adnan, (tx) => setMyVenuePassText(tx, "x".repeat(1001)))).rejects.toThrow(/invalid code/);
    await expect(t.asUser(coach, (tx) => setMyVenuePassText(tx, "HUB"))).rejects.toThrow(/not allowed/);
    expect(await rows()).toEqual([]);
  });

  it("can't be written directly, so nobody points it at a file that isn't theirs", async () => {
    await expect(
      t.asUser(adnan, (tx) => tx.query(`insert into guardian_venue_passes (guardian_id, code_text) values ($1, 'x')`, [DEV_IDS.adnan])),
    ).rejects.toThrow(/permission denied/);
    await t.asUser(adnan, (tx) => setMyVenuePassText(tx, "HUB-1"));
    await expect(t.asUser(adnan, (tx) => tx.query(`update guardian_venue_passes set code_text = 'y'`))).rejects.toThrow(/permission denied/);
    await expect(t.asUser(admin, (tx) => tx.query(`delete from guardian_venue_passes`))).rejects.toThrow(/permission denied/);
  });
});

describe("the screenshot", () => {
  it("opens for the parent only: not their co-parent, another parent, a coach or an admin, who can't delete it either", async () => {
    const file = await t.asUser(adnan, (tx) => setMyVenuePassImage(tx, png()));
    expect(await t.asUser(adnan, loadMyVenuePass)).toMatchObject({ text: null, imageId: file, imageBytes: 8 });
    expect(await open(adnan, file)).toHaveLength(1);
    for (const someone of [sara, other, coach, admin]) expect(await open(someone, file)).toHaveLength(0);
    await t.asUser(admin, (tx) => tx.query(`delete from club_files where id = $1`, [file]));
    await t.asUser(coach, (tx) => tx.query(`update club_files set name = 'x' where id = $1`, [file]));
    expect(await fileExists(file)).toBe(true);
  });

  it("leaves staff's own files as they were: plans and sheets still open for staff", async () => {
    const plan = await t.asUser(admin, (tx) => saveFile(tx, { name: "plan.pdf", mime: "application/pdf", data: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }, null));
    expect(await open(coach, plan)).toHaveLength(1);
    expect(await open(admin, plan)).toHaveLength(1);
  });

  it("is refused for anything but a JPEG, PNG or WebP", async () => {
    await expect(t.asUser(adnan, (tx) => setMyVenuePassImage(tx, { mime: "application/pdf", data: new Uint8Array([1]) }))).rejects.toThrow(/invalid image/);
  });

  it("never stays behind: replaced by another screenshot or by text, removed, or the parent deleted", async () => {
    const first = await t.asUser(adnan, (tx) => setMyVenuePassImage(tx, png(1)));
    const second = await t.asUser(adnan, (tx) => setMyVenuePassImage(tx, png(2)));
    expect(await fileExists(first)).toBe(false);
    expect(await fileExists(second)).toBe(true);
    await t.asUser(adnan, (tx) => setMyVenuePassText(tx, "HUB-READ"));
    expect(await fileExists(second)).toBe(false);
    expect(await rows()).toEqual([expect.objectContaining({ code_text: "HUB-READ", image_file_id: null })]);

    const third = await t.asUser(adnan, (tx) => setMyVenuePassImage(tx, png(3)));
    expect((await rows())[0]).toMatchObject({ code_text: null, image_file_id: third });
    await t.asUser(adnan, clearMyVenuePass);
    expect(await fileExists(third)).toBe(false);
    expect(await t.asUser(adnan, loadMyVenuePass)).toBeNull();

    const otherGuardian = (await t.asSystem((tx) => tx.query<{ id: string }>(`select id from guardians where email = 'parent1@example.com'`)))[0].id;
    const theirs = await t.asUser(other, (tx) => setMyVenuePassImage(tx, png(4)));
    await t.asSystem((tx) => tx.query(`delete from guardians where id = $1`, [otherGuardian]));
    expect(await fileExists(theirs)).toBe(false);
    expect(await rows()).toEqual([]);
  });
});

describe("the parent's data download", () => {
  it("says a code is saved and when, never the code", async () => {
    await t.asUser(adnan, (tx) => setMyVenuePassText(tx, "HUB-SECRET-9"));
    const data = await t.asUser(adnan, (tx) => buildFamilyExport(tx, new Date()));
    expect(data.you?.sportsHubEntryCode).toMatch(/^saved \d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(data)).not.toContain("HUB-SECRET-9");
    expect((await t.asUser(sara, (tx) => buildFamilyExport(tx, new Date()))).you?.sportsHubEntryCode).toBeNull();
  });
});
