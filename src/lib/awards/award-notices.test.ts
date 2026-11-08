import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import type { Email } from "../email/send";
import { awardMessage, awardWords, sendAwardNotices } from "./award-notices";
import type { MilestoneSenders } from "./milestones";

// Parents told about stars, points and badges (UX review, 8 Nov 2026: the peak-end rule).

const GIVEN = new Date("2026-11-06T19:40:00Z"); // Friday training, 7:40pm London
const at = (minutes: number) => new Date(GIVEN.getTime() + minutes * 60_000);

type Sent = { push: Map<string, { title: string; body: string; url: string }>[]; email: Email[] };
const senders = (sent: Sent, pushUsers: string[]): MilestoneSenders => ({
  pushUsers: async () => new Set(pushUsers),
  push: async (_tx, payloads) => {
    sent.push.push(payloads);
    return new Set(payloads.keys());
  },
  email: async (emails) => {
    sent.email.push(...emails);
    return { sent: emails, failed: [] };
  },
  appUrl: "https://app.example",
});
const none = (): Sent => ({ push: [], email: [] });

describe("the words", () => {
  it("lists what was given in plain English", () => {
    expect(awardWords({ stars: 1, points: 0, badges: [], reason: null })).toBe("a star");
    expect(awardWords({ stars: 1, points: 5, badges: [], reason: null })).toBe("a star and 5 points");
    expect(awardWords({ stars: 2, points: 1, badges: ["Great teamwork"], reason: null })).toBe("2 stars, 1 point and the Great teamwork badge");
    expect(awardWords({ stars: 0, points: 0, badges: ["Good adab", "Gave salam"], reason: null })).toBe("the Good adab and Gave salam badges");
    expect(awardMessage("Musa", { stars: 1, points: 5, badges: [], reason: "Great passing" })).toEqual({
      title: "Masha'Allah, Musa got a star and 5 points",
      body: '"Great passing" Tap to see it.',
    });
  });
});

describe("telling the parents", () => {
  let t: Awaited<ReturnType<typeof testDatabase>>;
  const id: Record<string, string> = {};
  let saraUser: string;

  const award = (player: string, stars: number, points: number, reason: string | null, when: Date) =>
    t.asSystem((tx) => tx.query(`insert into player_awards (player_id, stars, points, reason, created_at) values ($1, $2, $3, $4, $5)`, [player, stars, points, reason, when]));
  const badge = (player: string, badgeId: string, when: Date) =>
    t.asSystem((tx) => tx.query(`insert into player_badges (player_id, badge_id, given_at) values ($1, $2, $3)`, [player, badgeId, when]));
  const run = (now: Date, sent: Sent, pushUsers: string[] = []) => t.asSystem((tx) => sendAwardNotices(tx, now, senders(sent, pushUsers)));

  beforeAll(async () => {
    t = await testDatabase();
    await t.asSystem(async (tx) => {
      const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params))[0].id;
      id.sara = await one(`insert into guardians (first_name, last_name, email) values ('Sara', 'Khan', 'sara@x.test') returning id`);
      id.omar = await one(`insert into guardians (first_name, last_name, email) values ('Omar', 'Khan', 'omar@x.test') returning id`);
      id.musa = await one(`insert into players (first_name, last_name, age_group) values ('Musa', 'Khan', 'U7') returning id`);
      id.yusuf = await one(`insert into players (first_name, last_name, age_group) values ('Yusuf', 'Khan', 'U10') returning id`);
      id.bilal = await one(`insert into players (first_name, last_name, age_group) values ('Bilal', 'Khan', 'U15') returning id`);
      id.tom = await one(`insert into players (first_name, last_name, age_group, approved_at) values ('Tom', 'Khan', 'U7', null) returning id`);
      for (const p of [id.musa, id.yusuf, id.bilal, id.tom]) {
        await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2), ($1, $3)`, [p, id.sara, id.omar]);
      }
    });
    saraUser = await t.signIn("sara@x.test");
  });

  it("waits until the coaches have finished, then sends one notice per child with everything given", async () => {
    await award(id.musa, 1, 0, null, GIVEN);
    await award(id.musa, 0, 5, "Great passing", at(5));
    await badge(id.musa, "great-teamwork", at(8));

    // Eight minutes after the last award: still waiting, in case the coach gives more or takes one back.
    const early = none();
    expect(await run(at(16), early, [saraUser])).toEqual({ children: 0, told: 0 });
    expect(early.push.length + early.email.length).toBe(0);

    const sent = none();
    expect(await run(at(25), sent, [saraUser])).toEqual({ children: 1, told: 1 });
    // Sara has notifications on: a push. Omar hasn't: an email.
    expect(sent.push).toHaveLength(1);
    const push = [...sent.push[0].values()][0];
    expect(push).toEqual({
      title: "Masha'Allah, Musa got a star, 5 points and the Great teamwork badge",
      body: '"Great passing" Tap to see it.',
      url: `/player?child=${id.musa}`,
    });
    expect(sent.email.map((e) => [e.to, e.subject])).toEqual([["omar@x.test", "Masha'Allah, Musa got a star, 5 points and the Great teamwork badge"]]);
    expect(sent.email[0].text).toContain('They said: "Great passing"');

    // Told once.
    const again = none();
    expect(await run(at(90), again, [saraUser])).toEqual({ children: 0, told: 0 });
  });

  it("an award taken back before it settles is never sent", async () => {
    await award(id.yusuf, 1, 0, "Oops, wrong child", at(60));
    await t.asSystem((tx) => tx.query(`delete from player_awards where player_id = $1`, [id.yusuf]));
    const sent = none();
    await run(at(120), sent);
    expect(sent.push.length + sent.email.length).toBe(0);
  });

  it("never at night: the morning run sends it", async () => {
    const late = new Date("2026-11-06T20:45:00Z");
    await award(id.yusuf, 1, 0, null, late);
    const night = none();
    expect(await run(new Date("2026-11-06T21:30:00Z"), night)).toEqual({ children: 0, told: 0 });
    const morning = none();
    expect(await run(new Date("2026-11-07T08:09:00Z"), morning)).toEqual({ children: 1, told: 1 });
    expect(morning.email.map((e) => e.subject)).toEqual(["Masha'Allah, Yusuf got a star", "Masha'Allah, Yusuf got a star"]);
  });

  it("nothing for U15 (no awards there), a child waiting for approval, or awards over a week old", async () => {
    await award(id.bilal, 1, 0, null, at(200));
    await award(id.tom, 1, 0, null, at(200));
    await award(id.musa, 1, 0, null, new Date("2026-10-20T18:00:00Z"));
    const sent = none();
    await run(at(300), sent);
    expect(sent.push.length + sent.email.length).toBe(0);
  });

  it("a send that reaches nobody is tried again next hour, with the same email key", async () => {
    const sat = (m: number) => new Date(new Date("2026-11-07T10:00:00Z").getTime() + m * 60_000);
    await award(id.yusuf, 0, 3, null, sat(0));
    const failing: MilestoneSenders = { ...senders(none(), []), email: async (emails) => ({ sent: [], failed: emails }) };
    expect(await t.asSystem((tx) => sendAwardNotices(tx, sat(30), failing))).toEqual({ children: 1, told: 0 });
    const first: string[] = [];
    const retry: MilestoneSenders = {
      ...senders(none(), []),
      email: async (emails) => {
        first.push(...emails.map((e) => e.idempotencyKey ?? ""));
        return { sent: emails, failed: [] };
      },
    };
    expect(await t.asSystem((tx) => sendAwardNotices(tx, sat(90), retry))).toEqual({ children: 1, told: 1 });
    expect(first[0]).toMatch(new RegExp(`^awards:${id.yusuf}:`));
  });
});
