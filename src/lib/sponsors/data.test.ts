// Sponsors on the database: everyone signed in reads the ones on show (and their logos), only admins change them,
// and a hidden sponsor and its logo are the admins' alone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { cleanSponsorLink, loadSponsors, sponsorIcon, sponsorInitials, sponsorLinkLabel, sponsorOfTheWeek } from "./data";
import { addSponsorClick, addSponsorViews, loadSponsorViews, viewsSentence, viewsShort } from "./views";

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

  it("opens the small icon like the logo, and uses it in small spots where there is one", async () => {
    const icon = await t.asUser(admin, async (tx) => {
      const id = await logo(tx);
      await tx.query(`update sponsors set icon_file_id = $2, icon_bg = '#10294a', logo_bg = '#ffffff' where id = $1`, [shown, id]);
      return id;
    });
    expect(await canOpen(parent, icon)).toBe(true);
    const [first] = await t.asUser(parent, (tx) => loadSponsors(tx));
    expect(sponsorIcon(first)).toEqual({ fileId: icon, bg: "#10294a" });
    expect(sponsorIcon({ ...first, iconFileId: null })).toEqual({ fileId: shownLogo, bg: "#ffffff" });
    await expect(t.asUser(admin, (tx) => tx.query(`update sponsors set logo_bg = 'red' where id = $1`, [shown]))).rejects.toThrow();
  });

  it("gives each sponsor a week in turn, changing on Monday in London", () => {
    const three = ["a", "b", "c"];
    const sunday = sponsorOfTheWeek(three, new Date("2026-11-22T23:30:00Z"));
    expect(sponsorOfTheWeek(three, new Date("2026-11-16T00:30:00Z"))).toBe(sunday); // the Monday that week began
    const monday = sponsorOfTheWeek(three, new Date("2026-11-23T00:30:00Z"));
    expect(monday).not.toBe(sunday);
    expect(sponsorOfTheWeek(three, new Date("2026-11-29T23:30:00Z"))).toBe(monday);
    // Three weeks on it is the same sponsor's turn again, and every sponsor has had one.
    expect(sponsorOfTheWeek(three, new Date("2026-12-14T12:00:00Z"))).toBe(monday);
    expect(new Set([0, 7, 14].map((d) => sponsorOfTheWeek(three, new Date(Date.UTC(2026, 10, 23 + d, 12))))).size).toBe(3);
    // In summer the week turns at London's midnight, an hour before UTC's.
    expect(sponsorOfTheWeek(three, new Date("2026-06-28T23:30:00Z"))).not.toBe(sponsorOfTheWeek(three, new Date("2026-06-28T22:30:00Z")));
    expect(sponsorOfTheWeek([], new Date())).toBeNull();
  });

  it("keeps a total of times shown per place, which only admins read and nobody signed in can write", async () => {
    await t.asSystem(async (tx) => {
      await addSponsorViews(tx, [shown], "home");
      await addSponsorViews(tx, [shown], "home");
      await addSponsorViews(tx, [shown, hidden], "page");
      await addSponsorViews(tx, [], "gate");
    });
    const totals = await t.asUser(admin, (tx) => loadSponsorViews(tx));
    expect(totals[shown]).toEqual({ total: 3, byPlace: { home: 2, page: 1 } });
    expect(viewsSentence(totals[shown])).toBe("Shown 3 times in the last 30 days: 2 on Home, 1 on the sponsors page.");
    expect(viewsSentence(undefined)).toBe("Not shown yet in the last 30 days.");
    // Taps on a sponsor's link are counted apart from the times shown, only while it's on show and has a link.
    await t.asSystem(async (tx) => {
      await tx.query(`update sponsors set link_url = 'https://example.com' where id = any($1::uuid[])`, [[shown, hidden]]);
      await addSponsorClick(tx, shown);
      await addSponsorClick(tx, shown);
      await addSponsorClick(tx, hidden);
    });
    const tapped = await t.asUser(admin, (tx) => loadSponsorViews(tx));
    expect(tapped[shown]).toEqual({ total: 3, byPlace: { home: 2, page: 1 }, clicks: 2 });
    expect(tapped[hidden]?.clicks).toBeUndefined();
    expect(viewsSentence(tapped[shown])).toBe("Shown 3 times in the last 30 days: 2 on Home, 1 on the sponsors page. Their link was tapped 2 times.");
    expect(viewsShort(tapped[shown])).toBe("3 views · 2 link taps · 30 days");
    // The table holds a sponsor, a day, a place and a count: nothing about who.
    const columns = await t.asSystem((tx) => tx.query<{ c: string }>(`select column_name as c from information_schema.columns where table_name = 'sponsor_views' order by 1`));
    expect(columns.map((r) => r.c)).toEqual(["day", "place", "sponsor_id", "views"]);
    for (const who of [parent, coach]) {
      expect(await t.asUser(who, (tx) => loadSponsorViews(tx))).toEqual({});
      await expect(t.asUser(who, (tx) => addSponsorViews(tx, [shown], "home"))).rejects.toThrow();
    }
    await expect(t.asUser(admin, (tx) => addSponsorViews(tx, [shown], "home"))).rejects.toThrow();
  });

  it("the first sponsors' migration fills only a database that was already running, and only once", async () => {
    const sql = readFileSync(join(process.cwd(), "db/migrations/0054_first_sponsors.sql"), "utf8");
    const fresh = await testDatabase();
    const count = (db: typeof fresh) => db.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from sponsors`)).then((r) => r[0].n);
    // A database made afresh applied every migration just now: it stays empty, as the tests and the demo expect.
    expect(await count(fresh)).toBe(0);
    await fresh.asSystem((tx) => tx.query(sql));
    expect(await count(fresh)).toBe(0);
    // The club's database has migrations from before: there the five go in, each with a logo and an icon.
    await fresh.asSystem((tx) => tx.query(`update public.schema_migrations set applied_at = '2026-10-01' where name like '0001%'`));
    await fresh.asSystem((tx) => tx.query(sql));
    const rows = await fresh.asSystem((tx) =>
      tx.query<{ name: string; logo_bg: string; icon_bg: string; logo: number; icon: number; mime: string }>(
        `select s.name, s.logo_bg, s.icon_bg, l.size as logo, i.size as icon, l.mime from sponsors s
         join club_files l on l.id = s.logo_file_id join club_files i on i.id = s.icon_file_id order by s.sort`,
      ),
    );
    expect(rows.map((r) => r.name)).toEqual(["Banglatown Cash & Carry", "Morning Stars Care Ltd", "SAS Facilities", "Syed Capital Holdings", "A&S Accountancy Services"]);
    expect(rows.every((r) => r.mime === "image/png" && r.logo > 1000 && r.icon > 1000 && /^#[0-9a-f]{6}$/.test(r.logo_bg) && /^#[0-9a-f]{6}$/.test(r.icon_bg))).toBe(true);
    // Run again (or after the club has added its own): nothing is added twice.
    await fresh.asSystem((tx) => tx.query(sql));
    expect(await count(fresh)).toBe(5);
  });
});
