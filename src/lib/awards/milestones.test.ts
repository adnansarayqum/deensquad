import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import type { Email } from "../email/send";
import { countToReward, loadRewards, markRewarded, recordMilestones, sendMilestoneNotices, type MilestoneSenders } from "./milestones";

// The 20-point reward and the badges the register earns (the owner's voice note, 2 Nov 2026).

const DAY = new Date("2026-11-03T17:00:00Z"); // 17:00 London, outside quiet hours
const NIGHT = new Date("2026-11-03T22:00:00Z");

describe("badges and the reward", () => {
  let t: Awaited<ReturnType<typeof testDatabase>>;
  const id: Record<string, string> = {};
  let parentUser: string;
  let adminUser: string;
  let coachUser: string;

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
  const give = (player: string, points: number) => t.asSystem((tx) => tx.query(`insert into player_awards (player_id, stars, points) values ($1, 0, $2)`, [player, points]));

  beforeAll(async () => {
    t = await testDatabase();
    await t.asSystem(async (tx) => {
      const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params))[0].id;
      id.admin = await one(`insert into staff (email, display_name, role) values ('admin@x.test', 'Coach Monju', 'admin') returning id`);
      await tx.query(`insert into staff (email, display_name, role) values ('coach@x.test', 'Coach Hamza', 'coach')`);
      id.sara = await one(`insert into guardians (first_name, last_name, email) values ('Sara', 'Khan', 'sara@x.test') returning id`);
      id.musa = await one(`insert into players (first_name, last_name, age_group) values ('Musa', 'Khan', 'U7') returning id`);
      id.bilal = await one(`insert into players (first_name, last_name, age_group) values ('Bilal', 'Ahmed', 'U15') returning id`);
      await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [id.musa, id.sara]);
    });
    parentUser = await t.signIn("sara@x.test");
    adminUser = await t.signIn("admin@x.test");
    coachUser = await t.signIn("coach@x.test");
  });

  it("has the coaches' five badges, the admins' two, and First goal retired", async () => {
    const badges = await t.asSystem((tx) => tx.query<{ id: string; given_by: string; retired: boolean }>(`select id, given_by, retired from badges order by sort`));
    expect(badges.filter((b) => b.given_by === "coach" && !b.retired).map((b) => b.id)).toEqual(["good-adab", "great-teamwork", "great-goal", "great-listening", "gave-salam"]);
    expect(badges.filter((b) => b.given_by === "admin").map((b) => b.id)).toEqual(["ten-sessions", "on-time-5"]);
    expect(badges.find((b) => b.id === "first-goal")?.retired).toBe(true);
  });

  it("records 20 points once, never for U15, and tells the admins and the parents", async () => {
    await give(id.musa, 15);
    await give(id.bilal, 30);
    expect(await t.asSystem((tx) => recordMilestones(tx, DAY))).toEqual([]);
    await give(id.musa, 5);

    // At night nothing is sent, but the milestone is kept for the morning.
    const night: Sent = { push: [], email: [] };
    expect(await t.asSystem((tx) => sendMilestoneNotices(tx, NIGHT, senders(night, [parentUser])))).toEqual({ reached: 1, admins: 0, parents: 0 });
    expect(night.push.length + night.email.length).toBe(0);

    const sent: Sent = { push: [], email: [] };
    expect(await t.asSystem((tx) => sendMilestoneNotices(tx, DAY, senders(sent, [parentUser])))).toEqual({ reached: 0, admins: 1, parents: 1 });
    // The parent has notifications on: a push. The admin hasn't: an email.
    expect(sent.push).toHaveLength(1);
    expect([...sent.push[0].values()][0].title).toBe("Masha'Allah, Musa has reached 20 points");
    expect(sent.email.map((e) => [e.to, e.subject])).toEqual([["admin@x.test", "Musa K. (U7) has reached 20 points"]]);

    // Told once.
    const again: Sent = { push: [], email: [] };
    await t.asSystem((tx) => sendMilestoneNotices(tx, DAY, senders(again, [parentUser])));
    expect(again.push.length + again.email.length).toBe(0);
    await give(id.musa, 10);
    await t.asSystem((tx) => sendMilestoneNotices(tx, DAY, senders(again, [parentUser])));
    expect(again.push.length + again.email.length).toBe(0);
  });

  it("only staff read milestones, only admins mark the reward given", async () => {
    expect(await t.asUser(parentUser, (tx) => tx.query(`select * from points_milestones`))).toHaveLength(0);
    expect(await t.asUser(coachUser, (tx) => countToReward(tx))).toBe(1);
    expect(await t.asUser(coachUser, (tx) => markRewarded(tx, id.musa, id.admin, true))).toBe(false);
    const before = await t.asUser(adminUser, (tx) => loadRewards(tx));
    expect(before.toReward.map((r) => [r.name, r.points])).toEqual([["Musa Khan", 30]]);
    expect(await t.asUser(adminUser, (tx) => markRewarded(tx, id.musa, id.admin, true))).toBe(true);
    const after = await t.asUser(adminUser, (tx) => loadRewards(tx));
    expect(after.toReward).toHaveLength(0);
    expect(after.rewarded.map((r) => [r.name, r.rewardedBy])).toEqual([["Musa Khan", "Coach Monju"]]);
  });

  it("lists children the register says have earned 10 sessions or On time ×5", async () => {
    await t.asSystem(async (tx) => {
      for (let i = 0; i < 10; i++) {
        const starts = new Date(Date.UTC(2026, 8, 4 + i * 7, 17, 30));
        const [s] = await tx.query<{ id: string }>(
          `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'Training', $1, $1::timestamptz + interval '90 minutes', 'Hub', '{U7,U15}') returning id`,
          [starts],
        );
        // Musa is on time for the first 4 only; Bilal (U15) comes to all of them.
        const musaIn = new Date(starts.getTime() + (i < 4 ? -5 : 10) * 60_000);
        await tx.query(`insert into attendance (session_id, player_id, checked_in_at) values ($1, $2, $3), ($1, $4, $5)`, [s.id, id.musa, musaIn, id.bilal, starts]);
      }
    });
    let r = await t.asUser(adminUser, (tx) => loadRewards(tx));
    expect(r.badges.find((b) => b.id === "ten-sessions")?.candidates.map((c) => [c.name, c.count])).toEqual([["Musa Khan", 10]]);
    expect(r.badges.find((b) => b.id === "on-time-5")?.candidates).toEqual([]);
    await t.asSystem((tx) => tx.query(`insert into player_badges (player_id, badge_id) values ($1, 'ten-sessions')`, [id.musa]));
    r = await t.asUser(adminUser, (tx) => loadRewards(tx));
    expect(r.badges.find((b) => b.id === "ten-sessions")?.candidates).toEqual([]);
  });
});
