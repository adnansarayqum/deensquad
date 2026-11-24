import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import type { Email } from "../email/send";
import { loadCardStats, loadChildSpotlights, loadSpotlight, loadWeekSpotlight, positionShort, setSpotlight, weekStart, weekWords } from "./data";
import { sendSpotlightNotices } from "./notify";

// Player of the week (migration 0057).

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;
let adnan: string;
let coachStaffId: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  coach = await t.signIn(DEV_EMAILS.coach);
  adnan = await t.signIn(DEV_EMAILS.parent);
  [{ id: coachStaffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.coach]));
});

const pick = (playerId: string, comment: string, week = "2026-11-23") => t.asUser(coach, (tx) => setSpotlight(tx, { playerId, comment, staffId: coachStaffId, week }));

describe("the week", () => {
  it("starts on Monday in London, and is said in words", () => {
    expect(weekStart(new Date("2026-11-24T10:00:00Z"))).toBe("2026-11-23");
    expect(weekStart(new Date("2026-11-29T23:30:00Z"))).toBe("2026-11-23"); // Sunday night
    expect(weekStart(new Date("2026-11-30T00:30:00Z"))).toBe("2026-11-30");
    expect(weekWords("2026-11-23")).toBe("week of 23 November");
  });
});

describe("the card's numbers", () => {
  it("are the child's own season, counted from the register, never made up", async () => {
    const [{ id: player }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group, joined_on) values ('Card', 'Test', 'U10', '2026-08-01') returning id`),
    );
    const read = async () => (await t.asSystem((tx) => loadCardStats(tx, player, true))).map((s) => `${s.value} ${s.label}`);
    // Nothing of their own yet (only the sample club's finished sessions for the group, none attended).
    const before = await read();
    expect(before.slice(0, 1)).toEqual(["0 sessions"]);
    expect(before.slice(2)).toEqual(["0 in a row", "0 points", "0 stars", "0 badges"]);
    // Three more finished sessions, the newest of all: missed the oldest of them, came to the two since.
    const ids = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (title, starts_at, ends_at, age_groups, venue)
         select 'Card ' || n, now() - (n || ' hours')::interval, now() - (n || ' hours')::interval + interval '30 minutes', '{U10}', 'Hub'
         from generate_series(1, 3) n returning id`,
      ),
    );
    await t.asSystem(async (tx) => {
      const rows = await tx.query<{ id: string }>(`select id from sessions where id = any($1::uuid[]) order by starts_at desc limit 2`, [ids.map((r) => r.id)]);
      for (const r of rows) await tx.query(`insert into attendance (session_id, player_id, method) values ($1, $2, 'manual')`, [r.id, player]);
      await tx.query(`insert into player_awards (player_id, points, stars, reason) values ($1, 5, 1, 'Great pass')`, [player]);
    });
    const after = await read();
    expect(after[0]).toBe("2 sessions");
    expect(after.slice(2)).toEqual(["2 in a row", "5 points", "1 star", "0 badges"]);
    // A group without points, stars or badges gets the attendance three only.
    expect(await t.asSystem((tx) => loadCardStats(tx, player, false))).toHaveLength(3);
  });

  it("shortens the position, and leaves it out when the club hasn't set one", () => {
    expect(positionShort("Midfielder")).toBe("MID");
    expect(positionShort("goalkeeper")).toBe("GK");
    expect(positionShort("Striker")).toBe("ST");
    expect(positionShort("  ")).toBeNull();
    expect(positionShort(null)).toBeNull();
  });
});

describe("Player of the week", () => {
  it("is one child per group each week: a second pick replaces the first", async () => {
    const first = await pick(DEV_IDS.yusuf, "Great passing.");
    const [other] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where age_group = 'U10' and id <> $1 limit 1`, [DEV_IDS.yusuf]));
    const second = await pick(other.id, "Never gave up.");
    expect(second).toBe(first);
    const held = await t.asUser(coach, (tx) => loadWeekSpotlight(tx, "U10", "2026-11-23"));
    expect(held).toMatchObject({ playerId: other.id, comment: "Never gave up.", coach: "Coach Hamza" });
    // Another group the same week is separate.
    await pick(DEV_IDS.musa, "Listened well.");
    expect(await t.asSystem((tx) => tx.query(`select 1 from player_spotlights`))).toHaveLength(2);
  });

  it("is the family's own to read: another family can't", async () => {
    const id = (await pick(DEV_IDS.yusuf, "Great passing."))!;
    expect((await t.asUser(adnan, (tx) => loadChildSpotlights(tx, DEV_IDS.yusuf)))[0]).toMatchObject({ id, firstName: "Yusuf", comment: "Great passing." });
    const other = await t.signIn("parent16@example.com");
    expect(await t.asUser(other, (tx) => loadSpotlight(tx, id))).toBeNull();
    await expect(t.asUser(adnan, (tx) => tx.query(`update player_spotlights set comment = 'x' where id = $1 returning id`, [id]))).resolves.toHaveLength(0);
  });

  it("tells the parents once, by app where they have it and email otherwise, never at night", async () => {
    const id = (await pick(DEV_IDS.yusuf, "Great passing."))!;
    const pushed: string[][] = [];
    const emailed: Email[] = [];
    const senders = {
      push: async (_tx: unknown, users: string[]) => {
        pushed.push(users);
        return new Set([adnan]);
      },
      email: async (emails: Email[]) => {
        emailed.push(...emails);
        return { sent: emails, failed: [] };
      },
      appUrl: "https://app.example",
    };
    expect(await t.asSystem((tx) => sendSpotlightNotices(tx, new Date("2026-11-24T23:00:00Z"), senders))).toBe(0);
    const now = new Date(Date.now() + 1000);
    const day = new Date(now);
    day.setUTCHours(12, 0, 0, 0);
    const at = day > now ? day : new Date(day.getTime() + 86400_000);
    expect(await t.asSystem((tx) => sendSpotlightNotices(tx, at, senders))).toBe(2);
    expect(pushed).toHaveLength(1);
    // Sara has no phone signed in: she gets the email, with no surname and a link to the card.
    expect(emailed.map((e) => e.to)).toEqual([DEV_EMAILS.secondParent]);
    expect(emailed[0].subject).toBe("Masha'Allah, Yusuf is the U10s' Player of the week");
    expect(emailed[0].idempotencyKey).toBe(`spotlight:${id}:${DEV_IDS.sara}`);
    expect(await t.asSystem((tx) => sendSpotlightNotices(tx, at, senders))).toBe(0);
  });
});
