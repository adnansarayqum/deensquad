import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { addDays, nextFridaySession } from "../dates";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { answerKey, loadAnswers, loadCheckInsToday, saveAnswer } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let sara: string;
let friday: string;
const now = new Date();

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  [{ id: friday }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where starts_at = $1`, [nextFridaySession(now).start]));
});

describe("who answered for a shared child", () => {
  it("records the guardian who answered, and the other parent sees their name", async () => {
    expect(await t.asUser(adnan, (tx) => saveAnswer(tx, friday, DEV_IDS.yusuf, "coming"))).toBe(true);
    expect(await t.asUser(sara, (tx) => saveAnswer(tx, friday, DEV_IDS.yusuf, "away"))).toBe(true);
    const seen = await t.asUser(adnan, (tx) => loadAnswers(tx, [friday], [DEV_IDS.yusuf, DEV_IDS.musa]));
    const yusuf = seen.get(answerKey(friday, DEV_IDS.yusuf))!;
    expect(yusuf.answer).toBe("away");
    expect(yusuf.by).toEqual({ id: DEV_IDS.sara, name: "Sara" });
    expect(Number.isNaN(Date.parse(yusuf.at))).toBe(false);
    expect(seen.has(answerKey(friday, DEV_IDS.musa))).toBe(false);
  });

  it("shows no name for an answer saved without a guardian", async () => {
    await t.asSystem((tx) => tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')`, [friday, DEV_IDS.musa]));
    const seen = await t.asUser(sara, (tx) => loadAnswers(tx, [friday], [DEV_IDS.musa]));
    expect(seen.get(answerKey(friday, DEV_IDS.musa))).toMatchObject({ answer: "coming", by: null });
  });
});

describe("today's check-ins", () => {
  it("lists only today's (London) check-ins for the family's children, with the time", async () => {
    const at = new Date();
    const [{ id: today }, { id: lastWeek }] = await t.asSystem(async (tx) => [
      ...(await tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'Today', $1, $2, 'Hub', '{U7}') returning id`,
        [at, addDays(at, 0.01)],
      )),
      ...(await tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'Old', $1, $2, 'Hub', '{U7}') returning id`,
        [addDays(at, -7), addDays(at, -6.99)],
      )),
    ]);
    await t.asSystem(async (tx) => {
      await tx.query(`insert into attendance (session_id, player_id, checked_in_at) values ($1, $2, $3)`, [today, DEV_IDS.musa, at]);
      await tx.query(`insert into attendance (session_id, player_id) values ($1, $2)`, [lastWeek, DEV_IDS.musa]);
    });
    const seen = await t.asUser(sara, (tx) => loadCheckInsToday(tx, [DEV_IDS.yusuf, DEV_IDS.musa], at));
    expect([...seen]).toEqual([[answerKey(today, DEV_IDS.musa), at.toISOString()]]);
  });
});
