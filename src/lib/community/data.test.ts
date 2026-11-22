// The Community section on the database: everyone signed in reads the events on show and the sheets in Coach's
// corner (with their attachments), whatever their child's group; only admins post, hide or share.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS } from "@/lib/db/dev-seed";
import { loadCommunitySheets, loadPracticeSheets } from "@/lib/plans/data";
import { testDatabase } from "../../../test/db";
import { loadEvents, upcomingEvents } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let coach: string;
let parent: string;
let shared: string;
let notShared: string;
let sharedFile: string;
let otherFile: string;
let otherGroup: string;
const NOW = new Date("2026-11-22T12:00:00Z");
const PDF = new Uint8Array([37, 80, 68, 70]);

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: NOW });
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  parent = await t.signIn(DEV_EMAILS.parent);
  // A group none of the parent's children are in.
  const mine = await t.asUser(parent, (tx) => tx.query<{ g: string }>(`select unnest(my_age_groups())::text as g`));
  otherGroup = ["U6", "U7", "U10", "U12", "U15"].find((g) => !mine.some((m) => m.g === g))!;
});

describe("what's on", () => {
  it("lets an admin add events; parents and coaches read the ones on show, soonest first", async () => {
    await t.asUser(admin, (tx) =>
      tx.query(
        `insert into community_events (title, audience, starts_at, ends_at, weekly, venue, how_to_join, active) values
           ('Charity tournament', 'everyone', '2026-12-12T10:00:00Z', null, false, 'Bobby Moore Sports Hub', null, true),
           ('Brothers'' football', 'brothers', '2026-11-05T20:00:00Z', '2026-11-05T21:00:00Z', true, null, 'Just turn up', true),
           ('Not announced yet', 'everyone', '2026-12-01T10:00:00Z', null, false, null, null, false),
           ('Last month''s class', 'sisters', '2026-10-01T10:00:00Z', null, false, null, null, true)`,
      ),
    );
    for (const who of [parent, coach]) {
      const all = await t.asUser(who, (tx) => loadEvents(tx));
      expect(all.map((e) => e.title)).not.toContain("Not announced yet");
      const coming = upcomingEvents(all, NOW);
      // The weekly one next happens on Thursday 26 Nov; the finished one-off has gone.
      expect(coming.map((e) => [e.title, e.start.toISOString()])).toEqual([
        ["Brothers' football", "2026-11-26T20:00:00.000Z"],
        ["Charity tournament", "2026-12-12T10:00:00.000Z"],
      ]);
      expect(coming[0]).toMatchObject({ audience: "brothers", howToJoin: "Just turn up", weekly: true });
    }
    expect((await t.asUser(admin, (tx) => loadEvents(tx))).map((e) => e.title)).toContain("Not announced yet");
  });

  it("lets nobody but an admin add, change or remove an event", async () => {
    for (const who of [parent, coach]) {
      await expect(t.asUser(who, (tx) => tx.query(`insert into community_events (title, starts_at) values ('Sneaky', now())`))).rejects.toThrow();
      expect(await t.asUser(who, (tx) => tx.query(`update community_events set title = 'Changed' returning id`))).toEqual([]);
      expect(await t.asUser(who, (tx) => tx.query(`delete from community_events returning id`))).toEqual([]);
    }
  });

  it("refuses a link that isn't https, and a finish before the start", async () => {
    await expect(t.asUser(admin, (tx) => tx.query(`insert into community_events (title, starts_at, link_url) values ('Bad', now(), 'javascript:alert(1)')`))).rejects.toThrow();
    await expect(t.asUser(admin, (tx) => tx.query(`insert into community_events (title, starts_at, ends_at) values ('Bad', now(), now() - interval '1 hour')`))).rejects.toThrow();
  });
});

describe("coach's corner", () => {
  it("opens a shared sheet and its attachment to a parent of another group, and nothing else", async () => {
    await t.asUser(admin, async (tx) => {
      const file = () => tx.query<{ id: string }>(`insert into club_files (name, mime, size, data) values ('drills.pdf', 'application/pdf', 4, $1) returning id`, [PDF]).then((r) => r[0].id);
      sharedFile = await file();
      otherFile = await file();
      [{ id: shared }] = await tx.query<{ id: string }>(
        `insert into practice_sheets (title, body, age_groups, file_id, community) values ('Ball mastery', 'Ten touches each foot.', array[$1]::text[]::age_group[], $2, true) returning id`,
        [otherGroup, sharedFile],
      );
      [{ id: notShared }] = await tx.query<{ id: string }>(
        `insert into practice_sheets (title, age_groups, file_id) values ('Squad shape', array[$1]::text[]::age_group[], $2) returning id`,
        [otherGroup, otherFile],
      );
    });
    const corner = await t.asUser(parent, (tx) => loadCommunitySheets(tx));
    expect(corner.map((s) => s.id)).toEqual([shared]);
    expect(corner[0]).toMatchObject({ title: "Ball mastery", community: true, file: { id: sharedFile } });
    const files = await t.asUser(parent, (tx) => tx.query<{ id: string }>(`select id from club_files where id = any ($1::uuid[])`, [[sharedFile, otherFile]]));
    expect(files.map((f) => f.id)).toEqual([sharedFile]);
    expect(await t.asUser(parent, (tx) => tx.query(`select id from practice_sheets where id = $1`, [notShared]))).toEqual([]);
    // The parent's own practice list is still only their groups' sheets.
    const mine = await t.asUser(parent, (tx) => tx.query<{ g: string }>(`select unnest(my_age_groups())::text as g`));
    const own = await t.asUser(parent, (tx) => loadPracticeSheets(tx, mine.map((m) => m.g) as never));
    expect(own.map((s) => s.id)).not.toContain(shared);
  });

  it("lets a parent neither share a sheet nor take one out", async () => {
    expect(await t.asUser(parent, (tx) => tx.query(`update practice_sheets set community = false where id = $1 returning id`, [shared]))).toEqual([]);
    expect(await t.asUser(parent, (tx) => tx.query(`update practice_sheets set community = true where id = $1 returning id`, [notShared]))).toEqual([]);
    await t.asUser(admin, (tx) => tx.query(`update practice_sheets set community = false where id = $1`, [shared]));
    expect(await t.asUser(parent, (tx) => loadCommunitySheets(tx))).toEqual([]);
    expect(await t.asUser(parent, (tx) => tx.query(`select id from club_files where id = $1`, [sharedFile]))).toEqual([]);
  });
});
