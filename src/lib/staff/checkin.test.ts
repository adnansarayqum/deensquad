import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { passToken, readPass } from "../pass/token";
import { checkInByPass } from "./checkin";

// A Friday: the sample club's training (6:30pm, every age group) is today.
const friday = new Date("2026-10-09T17:00:00Z"); // 6pm in London
const atGate = new Date("2026-10-09T17:25:00Z");

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true, now: friday });
  coach = await t.signIn(DEV_EMAILS.coach);
});

describe("gate pass", () => {
  it("can't be made up or altered", () => {
    const pass = passToken(DEV_IDS.yusuf);
    expect(readPass(pass)).toBe(DEV_IDS.yusuf);
    expect(readPass(pass.replace(DEV_IDS.yusuf, DEV_IDS.musa))).toBeNull();
    expect(readPass(`DSP.${DEV_IDS.musa}.made-up-signature-xx`)).toBeNull();
    expect(readPass("https://example.com")).toBeNull();
    expect(readPass(undefined)).toBeNull();
  });
});

describe("scanning a pass", () => {
  it("checks in only that child, into their own group's session, once", async () => {
    const first = await t.asUser(coach, (tx) => checkInByPass(tx, passToken(DEV_IDS.musa), atGate));
    expect(first).toMatchObject({ ok: true, child: { firstName: "Musa", ageGroup: "U7", status: "checked_in", flags: ["no_payment_plan", "missing_consent"] } });
    const again = await t.asUser(coach, (tx) => checkInByPass(tx, passToken(DEV_IDS.musa), atGate));
    expect(again).toMatchObject({ ok: true, child: { status: "already_here" } });

    // Yusuf stayed at home: his brother's pass didn't check him in.
    const rows = await t.asSystem((tx) =>
      tx.query<{ player_id: string; method: string }>(
        `select a.player_id, a.method from attendance a join sessions s on s.id = a.session_id
         where s.starts_at::date = '2026-10-09' and a.player_id = any($1::uuid[])`,
        [[DEV_IDS.yusuf, DEV_IDS.musa]],
      ),
    );
    expect(rows).toEqual([{ player_id: DEV_IDS.musa, method: "qr" }]);
  });

  it("says when there's no session today", async () => {
    const saturday = new Date("2026-10-10T10:00:00Z");
    expect(await t.asUser(coach, (tx) => checkInByPass(tx, passToken(DEV_IDS.yusuf), saturday))).toMatchObject({
      ok: true,
      child: { status: "no_session_today" },
    });
  });

  it("picks the same session every time when two overlap: earliest start, then id", async () => {
    // A Saturday with no seeded sessions. Inserted latest-first, so table order can't decide it.
    const saturday = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 10, h - 1, m)); // London is UTC+1 in October
    const add = (id: string, title: string, start: Date) =>
      t.asSystem((tx) =>
        tx.query(`insert into sessions (id, kind, title, starts_at, ends_at, venue, age_groups) values ($1, 'training', $2, $3, $4, 'Hub', '{U7}')`, [
          id,
          title,
          start,
          saturday(12),
        ]),
      );
    await add("30000000-0000-4000-8000-00000000000f", "Later start", saturday(10, 30));
    await add("30000000-0000-4000-8000-00000000000b", "Same start, higher id", saturday(10));
    await add("30000000-0000-4000-8000-00000000000a", "Same start, lower id", saturday(10));

    const scan = await t.asUser(coach, (tx) => checkInByPass(tx, passToken(DEV_IDS.musa), saturday(11)));
    expect(scan).toMatchObject({ ok: true, child: { status: "checked_in", session: { title: "Same start, lower id" } } });
    const rows = await t.asSystem((tx) => tx.query<{ session_id: string }>(`select session_id from attendance where player_id = $1 and session_id::text like '30000000-%'`, [DEV_IDS.musa]));
    expect(rows).toEqual([{ session_id: "30000000-0000-4000-8000-00000000000a" }]);
  });

  it("rejects anything that isn't a pass, and parents can't check anyone in", async () => {
    expect(await t.asUser(coach, (tx) => checkInByPass(tx, "hello", atGate))).toEqual({ ok: false, reason: "not_a_pass" });
    const parent = await t.signIn(DEV_EMAILS.parent);
    await expect(t.asUser(parent, (tx) => checkInByPass(tx, passToken(DEV_IDS.yusuf), atGate))).rejects.toThrow(/row-level security/);
  });
});
