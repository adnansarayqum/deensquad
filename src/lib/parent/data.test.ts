import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { addDays, nextFridaySession } from "../dates";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { answerKey, loadAnswers, loadCheckInsToday, saveAnswer, saveAwayReason } from "./data";
import { loadRegister } from "../staff/register";

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

  it("shows no name for a guardian no longer linked to the child, even to a viewer who is staff and a parent", async () => {
    await t.asSystem((tx) =>
      tx.query(
        `with g as (insert into guardians (first_name, last_name, email) values ('Staff', 'Parent', $1) returning id)
         insert into player_guardians (player_id, guardian_id, relationship) select $2, id, 'father' from g`,
        [DEV_EMAILS.admin, DEV_IDS.yusuf],
      ),
    );
    const staffParent = await t.signIn(DEV_EMAILS.admin);
    await t.asUser(sara, (tx) => saveAnswer(tx, friday, DEV_IDS.yusuf, "away"));
    const before = await t.asUser(staffParent, (tx) => loadAnswers(tx, [friday], [DEV_IDS.yusuf]));
    expect(before.get(answerKey(friday, DEV_IDS.yusuf))?.by).toEqual({ id: DEV_IDS.sara, name: "Sara" });
    await t.asSystem((tx) => tx.query(`delete from player_guardians where player_id = $1 and guardian_id = $2`, [DEV_IDS.yusuf, DEV_IDS.sara]));
    const after = await t.asUser(staffParent, (tx) => loadAnswers(tx, [friday], [DEV_IDS.yusuf]));
    expect(after.get(answerKey(friday, DEV_IDS.yusuf))).toMatchObject({ answer: "away", by: { id: DEV_IDS.sara, name: null } });
  });

  it("shows no name for an answer saved without a guardian", async () => {
    await t.asSystem((tx) => tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')`, [friday, DEV_IDS.musa]));
    const seen = await t.asUser(sara, (tx) => loadAnswers(tx, [friday], [DEV_IDS.musa]));
    expect(seen.get(answerKey(friday, DEV_IDS.musa))).toMatchObject({ answer: "coming", by: null });
  });
});

describe("a reason for not coming", () => {
  it("is kept on a Not this week answer, sent to the coaches in one thread per session and child, and cleared by Coming", async () => {
    // Not until the answer is Not this week.
    expect(await t.asUser(adnan, (tx) => saveAwayReason(tx, friday, DEV_IDS.yusuf, "Poorly"))).toBeNull();
    await t.asUser(adnan, (tx) => saveAnswer(tx, friday, DEV_IDS.yusuf, "away"));
    const thread = await t.asUser(adnan, (tx) => saveAwayReason(tx, friday, DEV_IDS.yusuf, "Poorly"));
    expect(thread).toBeTruthy();
    // The other parent changing it lands in the same thread.
    expect(await t.asUser(sara, (tx) => saveAwayReason(tx, friday, DEV_IDS.yusuf, "Poorly, back next week"))).toBe(thread);
    const rows = await t.asSystem((tx) =>
      tx.query<{ subject: string; started_by_kind: string; staff_id: string | null; body: string; author_kind: string; author_name: string }>(
        `select c.subject, c.started_by_kind, c.staff_id, m.body, m.author_kind, m.author_name
         from conversations c join conversation_messages m on m.conversation_id = c.id where c.id = $1 order by m.created_at`,
        [thread],
      ),
    );
    expect(rows.map((r) => [r.body, r.author_name])).toEqual([
      ["Poorly", "Adnan"],
      ["Poorly, back next week", "Sara"],
    ]);
    expect(rows[0]).toMatchObject({ started_by_kind: "parent", staff_id: null, author_kind: "parent" });
    expect(rows[0].subject).toMatch(/^Not coming: .+, \w{3} \d{1,2} \w{3}$/);
    expect((await t.asUser(sara, (tx) => loadAnswers(tx, [friday], [DEV_IDS.yusuf]))).get(answerKey(friday, DEV_IDS.yusuf))?.reason).toBe(
      "Poorly, back next week",
    );
    // The coach sees it on the register.
    const coach = await t.signIn(DEV_EMAILS.coach);
    const register = await t.asUser(coach, (tx) => loadRegister(tx, { now, sessionId: friday, group: "U10" }));
    expect(register?.rows.find((r) => r.id === DEV_IDS.yusuf)?.awayReason).toBe("Poorly, back next week");
    // Coming clears it.
    await t.asUser(adnan, (tx) => saveAnswer(tx, friday, DEV_IDS.yusuf, "coming"));
    expect((await t.asUser(adnan, (tx) => loadAnswers(tx, [friday], [DEV_IDS.yusuf]))).get(answerKey(friday, DEV_IDS.yusuf))?.reason).toBeNull();
  });

  it("only for the family's own child", async () => {
    const other = await t.signIn("parent1@example.com");
    await t.asUser(adnan, (tx) => saveAnswer(tx, friday, DEV_IDS.yusuf, "away"));
    expect(await t.asUser(other, (tx) => saveAwayReason(tx, friday, DEV_IDS.yusuf, "Made up"))).toBeNull();
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
