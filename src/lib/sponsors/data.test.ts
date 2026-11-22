// Sponsors on the database: everyone signed in reads the ones on show (and their logos), only admins change them,
// and a hidden sponsor and its logo are the admins' alone.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { cleanSponsorLink, loadSponsors, sponsorInitials, sponsorLinkLabel } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let coach: string;
let parent: string;
let shown: string;
let hidden: string;
let shownLogo: string;
let hiddenLogo: string;

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: new Date("2026-11-22T12:00:00Z") });
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  parent = await t.signIn(DEV_EMAILS.parent);
});

const logo = (tx: Parameters<Parameters<typeof t.asUser>[1]>[0]) =>
  tx.query<{ id: string }>(`insert into club_files (name, mime, size, data) values ('sponsor-logo.png', 'image/png', 8, $1) returning id`, [PNG]).then((r) => r[0].id);
const canOpen = (who: string, file: string) => t.asUser(who, (tx) => tx.query(`select id from club_files where id = $1`, [file])).then((r) => r.length === 1);

describe("sponsors", () => {
  it("lets an admin add sponsors, shown in the club's order", async () => {
    await t.asUser(admin, async (tx) => {
      shownLogo = await logo(tx);
      hiddenLogo = await logo(tx);
      [{ id: shown }] = await tx.query<{ id: string }>(
        `insert into sponsors (name, sponsors_what, link_url, offer, logo_file_id, sort) values ('Test Motors', 'U10 tournament kit', 'https://example.com/', '10% off', $1, 2) returning id`,
        [shownLogo],
      );
      [{ id: hidden }] = await tx.query<{ id: string }>(`insert into sponsors (name, logo_file_id, active, sort) values ('Not yet', $1, false, 1) returning id`, [hiddenLogo]);
    });
    const all = await t.asUser(admin, (tx) => loadSponsors(tx, { includeHidden: true }));
    expect(all.map((s) => s.name)).toEqual(["Not yet", "Test Motors"]);
  });

  it("shows parents and coaches only the sponsors on show, even when they ask for the hidden ones", async () => {
    for (const who of [parent, coach]) {
      const seen = await t.asUser(who, (tx) => loadSponsors(tx, { includeHidden: true }));
      expect(seen.map((s) => s.id)).toEqual([shown]);
      expect(seen.map((s) => s.id)).not.toContain(hidden);
      expect(seen[0]).toMatchObject({ sponsorsWhat: "U10 tournament kit", offer: "10% off", linkUrl: "https://example.com/", logoFileId: shownLogo });
    }
  });

  it("opens a logo to a parent only while its sponsor is on show", async () => {
    expect(await canOpen(parent, shownLogo)).toBe(true);
    expect(await canOpen(parent, hiddenLogo)).toBe(false);
    await t.asUser(admin, (tx) => tx.query(`update sponsors set active = false where id = $1`, [shown]));
    expect(await canOpen(parent, shownLogo)).toBe(false);
    await t.asUser(admin, (tx) => tx.query(`update sponsors set active = true where id = $1`, [shown]));
  });

  it("lets nobody but an admin add, change or remove a sponsor", async () => {
    for (const who of [parent, coach]) {
      await expect(t.asUser(who, (tx) => tx.query(`insert into sponsors (name) values ('Sneaky')`))).rejects.toThrow();
      expect(await t.asUser(who, (tx) => tx.query(`update sponsors set name = 'Changed' where id = $1 returning id`, [shown]))).toEqual([]);
      expect(await t.asUser(who, (tx) => tx.query(`delete from sponsors where id = $1 returning id`, [shown]))).toEqual([]);
    }
    expect((await t.asUser(admin, (tx) => loadSponsors(tx))).map((s) => s.name)).toEqual(["Test Motors"]);
  });

  it("keeps only https links, and refuses them in the database too", async () => {
    expect(cleanSponsorLink(" https://example.com/shop ")).toBe("https://example.com/shop");
    expect(cleanSponsorLink("http://example.com")).toBeNull();
    expect(cleanSponsorLink("javascript:alert(1)")).toBeNull();
    expect(cleanSponsorLink("https://user:pw@example.com")).toBeNull();
    expect(cleanSponsorLink("https://localhost")).toBeNull();
    await expect(t.asUser(admin, (tx) => tx.query(`update sponsors set link_url = 'javascript:alert(1)' where id = $1`, [shown]))).rejects.toThrow();
  });

  it("words the link button and the initials", () => {
    expect(sponsorLinkLabel("https://www.instagram.com/someone")).toBe("See them on Instagram");
    expect(sponsorLinkLabel("https://instagram.com.evil.example/")).toBe("Visit their website");
    expect(sponsorLinkLabel("https://example.co.uk")).toBe("Visit their website");
    expect(sponsorInitials("Test Motors")).toBe("TM");
    expect(sponsorInitials("Shahi")).toBe("SH");
  });
});
