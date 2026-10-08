import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { buildFamilyExport } from "../parent/export";
import { allowFeed, allowLookupFrom, FEED_LIMIT, MISS_LIMIT, recordMiss, windowCounter, guardianForToken, hashCalendarToken, loadFeedSessions, loadMyCalendarLink, resetFeedLimit, setMyCalendarToken, tokenFromFile } from "./feed";

const now = new Date("2026-10-07T12:00:00Z");
const day = (n: number, hour = 17) => new Date(Date.UTC(2026, 9, 7 + n, hour, 30));

let t: Awaited<ReturnType<typeof testDatabase>>;
let ids: Record<string, string>;
let parentUser: string;

beforeEach(async () => {
  t = await testDatabase();
  ids = await t.asSystem(async (tx) => {
    const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params))[0].id;
    const amina = await one(`insert into guardians (first_name, last_name, email) values ('Amina', 'Khan', 'amina@example.com') returning id`);
    const other = await one(`insert into guardians (first_name, last_name, email) values ('Omar', 'Ali', 'omar@example.com') returning id`);
    const yusuf = await one(`insert into players (first_name, last_name, age_group) values ('Yusuf', 'Khan', 'U10') returning id`);
    const musa = await one(`insert into players (first_name, last_name, age_group) values ('Musa', 'Khan', 'U7') returning id`);
    const bilal = await one(`insert into players (first_name, last_name, age_group) values ('Bilal', 'Ali', 'U12') returning id`);
    await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $3), ($2, $3), ($4, $5)`, [yusuf, musa, amina, bilal, other]);
    const session = (title: string, groups: string, start: Date, extra = "") =>
      one(
        `insert into sessions (title, starts_at, ends_at, venue, age_groups${extra ? ", cancelled_at, cancel_reason" : ""})
         values ($1, $2, $3, 'Bobby Moore Sports Hub', $4::age_group[]${extra ? ", now(), $5" : ""}) returning id`,
        [title, start, new Date(start.getTime() + 90 * 60000), groups, ...(extra ? [extra] : [])],
      );
    const s = {
      u10: await session("U10 training", "{U10}", day(2)),
      joint: await session("Friday training", "{U7,U10}", day(9)),
      u12: await session("U12 training", "{U12}", day(2)),
      cancelled: await session("U7 training", "{U7}", day(16), "Pitch flooded"),
      old: await session("Old training", "{U10}", day(-40)),
      recent: await session("Last week", "{U10}", day(-7)),
      far: await session("Next summer", "{U10}", day(200)),
      cupWithout: await session("U10 cup", "{U10}", day(5)),
      cupWith: await session("U7 festival", "{U7}", day(6)),
    };
    // Squads: Yusuf isn't in the U10 cup squad (Zayd is), Musa is in the U7 festival squad.
    const zayd = await one(`insert into players (first_name, last_name, age_group) values ('Zayd', 'Other', 'U10') returning id`);
    await tx.query(`insert into session_squads (session_id, player_id) values ($1, $2), ($3, $4)`, [s.cupWithout, zayd, s.cupWith, musa]);
    return { amina, other, yusuf, musa, bilal, ...s };
  });
  parentUser = await t.signIn("amina@example.com");
  resetFeedLimit();
});

describe("family calendar feed", () => {
  it("has only this family's sessions, by group and squad, from 30 days ago to 6 months ahead, cancelled ones included", async () => {
    const sessions = await t.asSystem((tx) => loadFeedSessions(tx, ids.amina, now));
    expect(sessions.map((s) => s.title)).toEqual(["Last week", "U10 training", "U7 festival", "Friday training", "U7 training"]);
    expect(sessions.find((s) => s.title === "Friday training")!.children).toEqual(["Musa", "Yusuf"]);
    expect(sessions.find((s) => s.title === "U7 festival")!.children).toEqual(["Musa"]);
    const cancelled = sessions.find((s) => s.title === "U7 training")!;
    expect(cancelled).toMatchObject({ cancelled: true, cancelReason: "Pitch flooded" });
    // No surnames anywhere, and no other family's child.
    expect(JSON.stringify(sessions)).not.toMatch(/Khan|Bilal|Zayd/);
  });

  it("finds the parent by the link's token, stores only its hash, and a reset stops the old link", async () => {
    expect(await t.asUser(parentUser, loadMyCalendarLink)).toBeNull();
    const first = await t.asUser(parentUser, setMyCalendarToken);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenFromFile(`${first}.ics`)).toBe(first);
    expect(tokenFromFile("nope.ics")).toBeNull();
    const [row] = await t.asSystem((tx) => tx.query<{ h: string }>(`select calendar_token_hash as h from guardians where id = $1`, [ids.amina]));
    expect(row.h).toBe(hashCalendarToken(first));
    expect(row.h).not.toBe(first);
    expect(await t.asSystem((tx) => guardianForToken(tx, first))).toBe(ids.amina);
    expect(await t.asUser(parentUser, loadMyCalendarLink)).not.toBeNull();

    const second = await t.asUser(parentUser, setMyCalendarToken);
    expect(await t.asSystem((tx) => guardianForToken(tx, first))).toBeNull();
    expect(await t.asSystem((tx) => guardianForToken(tx, second))).toBe(ids.amina);

    // The data download says a link exists, never the link or its hash.
    const data = await t.asUser(parentUser, (tx) => buildFamilyExport(tx, now));
    expect(data.you?.calendarLink).not.toBeNull();
    expect(JSON.stringify(data)).not.toContain(second);
    expect(JSON.stringify(data)).not.toContain(hashCalendarToken(second));
  });

  it("can't be set by someone who isn't a parent, or set directly", async () => {
    const stranger = await t.signIn("stranger@example.com");
    await expect(t.asUser(stranger, setMyCalendarToken)).rejects.toThrow();
    await expect(t.asUser(parentUser, (tx) => tx.query(`update guardians set calendar_token_hash = 'x' where id = $1`, [ids.other]))).resolves.toEqual([]);
    const [row] = await t.asSystem((tx) => tx.query<{ h: string | null }>(`select calendar_token_hash as h from guardians where id = $1`, [ids.other]));
    expect(row.h).toBeNull();
  });

  it("goes with the parent when they're deleted", async () => {
    const token = await t.asUser(parentUser, setMyCalendarToken);
    await t.asSystem((tx) => tx.query(`delete from guardians where id = $1`, [ids.amina]));
    expect(await t.asSystem((tx) => guardianForToken(tx, token))).toBeNull();
  });

  it("allows 60 fetches an hour per link", () => {
    const start = 1_000_000;
    for (let i = 0; i < FEED_LIMIT; i++) expect(allowFeed("a", start)).toBe(true);
    expect(allowFeed("a", start)).toBe(false);
    expect(allowFeed("b", start)).toBe(true);
    expect(allowFeed("a", start + 60 * 60_000)).toBe(true);
  });

  it("stops an address after 30 unknown links an hour, without touching others", () => {
    const start = 2_000_000;
    for (let i = 0; i < MISS_LIMIT; i++) {
      expect(allowLookupFrom("10.0.0.1", start)).toBe(true);
      recordMiss("10.0.0.1", start);
    }
    expect(allowLookupFrom("10.0.0.1", start)).toBe(false);
    expect(allowLookupFrom("10.0.0.2", start)).toBe(true);
    expect(allowLookupFrom("10.0.0.1", start + 60 * 60_000)).toBe(true);
  });

  it("when full, drops the oldest entries instead of forgetting every count", () => {
    const counter = windowCounter(2, 60_000, 3);
    counter.hit("real", 0);
    counter.hit("real", 0);
    expect(counter.hit("real", 0)).toBe(false);
    counter.hit("a", 10);
    counter.hit("b", 20);
    // A fourth key pushes out only the oldest ("real"), not "a" and "b".
    counter.hit("c", 30);
    expect([counter.has("real"), counter.has("a"), counter.has("b"), counter.has("c")]).toEqual([false, true, true, true]);
    // Expired entries go first: at 60,015 "a" (started at 10) has expired, so "b" survives a new key.
    counter.hit("d", 60_015);
    expect([counter.has("a"), counter.has("b"), counter.has("d")]).toEqual([false, true, true]);
    expect(counter.over("b", 60_015)).toBe(false);
  });
});
