import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { nextFridaySession } from "../dates";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { answerKey, loadAnswers, saveAnswer } from "./data";

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
