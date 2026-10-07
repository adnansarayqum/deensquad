import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import type { Queryable } from "../db/types";
import { loadDashboard } from "./dashboard";
import { loadChild, loadFamilies } from "./data";

// "Missing lately" (need=missing3): the last 3 sessions for a child, counting only finished, uncancelled sessions
// for them, after they joined, with their group's register taken, all have no check-in for them. The rule uses the
// database's now(), so the fixtures are dated from the real clock.

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

beforeEach(async () => {
  t = await testDatabase();
  await t.asSystem((tx) => tx.query(`insert into staff (email, display_name, role) values ('admin@example.com', 'Ibrahim Khan', 'admin')`));
  admin = await t.signIn("admin@example.com");
});

const sys = <T,>(fn: (tx: Queryable) => Promise<T>) => t.asSystem(fn);
const child = (name: string, group = "U10", joinedDaysAgo = 90) =>
  sys(async (tx) => (await tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group, joined_on) values ($1, 'Test', $2::age_group, $3) returning id`, [name, group, dateOnly(daysAgo(joinedDaysAgo))]))[0].id);
const session = (ago: number, { groups = "{U10}", cancelled = false } = {}) =>
  sys(async (tx) =>
    (
      await tx.query<{ id: string }>(
        `insert into sessions (title, starts_at, ends_at, venue, age_groups, cancelled_at) values ('Training', $1, $2, 'Hub', $3::age_group[], $4) returning id`,
        [daysAgo(ago), new Date(daysAgo(ago).getTime() + 90 * 60000), groups, cancelled ? daysAgo(ago) : null],
      )
    )[0].id,
  );
const checkIn = (sessionId: string, playerId: string) => sys((tx) => tx.query(`insert into attendance (session_id, player_id) values ($1, $2)`, [sessionId, playerId]));
const pick = (sessionId: string, playerId: string) => sys((tx) => tx.query(`insert into session_squads (session_id, player_id) values ($1, $2)`, [sessionId, playerId]));

async function missing(): Promise<string[]> {
  const rows = await t.asUser(admin, (tx) => loadFamilies(tx, null, undefined, { need: "missing3" }));
  return rows.map((r) => r.firstName).sort();
}

/** Ali comes to every session, so each one has the U10 register taken. */
async function heldWithAli(ali: string, ...agos: number[]) {
  const ids: string[] = [];
  for (const ago of agos) {
    const id = await session(ago);
    await checkIn(id, ali);
    ids.push(id);
  }
  return ids;
}

describe("children who've missed their last 3 sessions", () => {
  it("flags a child with no check-in at their last 3 sessions, not one who came", async () => {
    const ali = await child("Ali");
    const yusuf = await child("Yusuf");
    const [first] = await heldWithAli(ali, 28, 21, 14, 7);
    await checkIn(first, yusuf);
    // A session still to come doesn't count.
    await session(-2);
    expect(await missing()).toEqual(["Yusuf"]);

    const detail = await t.asUser(admin, (tx) => loadChild(tx, yusuf));
    expect(detail?.missedLast3).toBe(true);
    expect((await t.asUser(admin, (tx) => loadChild(tx, ali)))?.missedLast3).toBe(false);
  });

  it("needs 3 sessions: two missed isn't missing lately", async () => {
    const ali = await child("Ali");
    await child("Yusuf");
    await heldWithAli(ali, 14, 7);
    expect(await missing()).toEqual([]);
  });

  it("doesn't count cancelled sessions", async () => {
    const ali = await child("Ali");
    const yusuf = await child("Yusuf");
    const [first] = await heldWithAli(ali, 28, 21, 14);
    await checkIn(first, yusuf);
    const cancelled = await session(7, { cancelled: true });
    await checkIn(cancelled, ali);
    expect(await missing()).toEqual([]);
  });

  it("doesn't count a session whose register wasn't taken for the group", async () => {
    const ali = await child("Ali");
    const yusuf = await child("Yusuf");
    const [first] = await heldWithAli(ali, 28, 21, 14);
    await checkIn(first, yusuf);
    await session(7); // nobody from U10 checked in
    // A joint session where only a U7 child was marked in hasn't had the U10 register taken either.
    const noor = await child("Noor", "U7");
    const joint = await session(5, { groups: "{U7,U10}" });
    await checkIn(joint, noor);
    expect(await missing()).toEqual([]);
  });

  it("doesn't count sessions before the child joined", async () => {
    const ali = await child("Ali");
    await child("Yusuf", "U10", 10);
    await heldWithAli(ali, 21, 14, 7);
    expect(await missing()).toEqual([]);
  });

  it("doesn't count squad sessions the child wasn't picked for", async () => {
    const ali = await child("Ali");
    const yusuf = await child("Yusuf");
    const [first] = await heldWithAli(ali, 28, 21, 14);
    await checkIn(first, yusuf);
    const cup = await session(5);
    await pick(cup, ali);
    await checkIn(cup, ali);
    expect(await missing()).toEqual([]);
    // Picked and not there: that counts.
    await pick(cup, yusuf);
    expect(await missing()).toEqual(["Yusuf"]);
  });

  it("gives the overview the same number as the Families list it links to, and the child page the last-here date", async () => {
    const ali = await child("Ali");
    const yusuf = await child("Yusuf");
    const musa = await child("Musa");
    await child("Noor", "U7");
    const [first] = await heldWithAli(ali, 28, 21, 14, 7);
    await checkIn(first, yusuf);
    const list = await missing();
    expect(list).toEqual(["Musa", "Yusuf"]);
    const all = await t.asUser(admin, (tx) => loadDashboard(tx, { now: new Date(), limit: null, withShop: false }));
    expect(all.attendance.missedLast3).toBe(list.length);
    // A coach limited to U7 sees none of them.
    const u7 = await t.asUser(admin, (tx) => loadDashboard(tx, { now: new Date(), limit: ["U7"], withShop: false }));
    expect(u7.attendance.missedLast3).toBe(0);

    // Yusuf was last here 28 days ago: shown when that's this season (from 1 August). Musa has never been.
    const detail = await t.asUser(admin, (tx) => loadChild(tx, yusuf));
    const today = new Date();
    const season = new Date(Date.UTC(today.getUTCMonth() >= 7 ? today.getUTCFullYear() : today.getUTCFullYear() - 1, 7, 1));
    expect(detail?.lastHereThisSeason ? new Date(detail.lastHereThisSeason).getTime() : null).toEqual(daysAgo(28) >= season ? expect.any(Number) : null);
    expect((await t.asUser(admin, (tx) => loadChild(tx, musa)))?.lastHereThisSeason).toBeNull();
  });
});
