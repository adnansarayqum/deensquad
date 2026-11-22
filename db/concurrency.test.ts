import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meet, REAL_DATABASE_URL, realDatabase } from "../test/real-db";
import { nudgeUnread } from "@/lib/admin/nudge";
import { addSessionRun, type NewSessions } from "@/lib/admin/sessions";
import { sendAwardNotices } from "@/lib/awards/award-notices";
import { sendMilestoneNotices, type MilestoneSenders } from "@/lib/awards/milestones";
import type { PushSend } from "@/lib/chase/senders";
import { takeGatePayment } from "@/lib/gate/payments";
import { markHere } from "@/lib/staff/checkin";

// Two things at the same moment (14 Nov 2026 review): two admins pressing the same button, a double submit, the
// hourly job overlapping work started by a tap, or the old and new server both running during a deploy. Each test
// starts two transactions on a real Postgres and holds them part-way so they truly overlap, then checks the result
// is what one of them alone would have left. Skipped without CONCURRENCY_DATABASE_URL (test/real-db.ts).

const DAY = new Date("2026-11-03T17:00:00Z"); // 17:00 London, outside quiet hours

describe.skipIf(!REAL_DATABASE_URL)("two at once, on a real Postgres", () => {
  let t: Awaited<ReturnType<typeof realDatabase>>;
  const id: Record<string, string> = {};
  let adminUser: string;
  const saved = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public";
    process.env.VAPID_PRIVATE_KEY = "test-private";
    t = await realDatabase();
    await t.asSystem(async (tx) => {
      const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params))[0].id;
      id.admin = await one(`insert into staff (email, display_name, role) values ('admin@x.test', 'Coach Monju', 'admin') returning id`);
      id.sara = await one(`insert into guardians (first_name, last_name, email) values ('Sara', 'Khan', 'sara@x.test') returning id`);
      id.musa = await one(`insert into players (first_name, last_name, age_group) values ('Musa', 'Khan', 'U7') returning id`);
      await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [id.musa, id.sara]);
      await tx.query(`insert into payment_status (player_id, state) values ($1, 'pay_as_you_go'::text::payment_state)`, [id.musa]);
    });
    id.saraUser = await t.signIn("sara@x.test");
    adminUser = await t.signIn("admin@x.test");
    await t.asSystem((tx) => tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/sara', 'k', 'a')`, [id.saraUser]));
  }, 120_000);

  afterAll(async () => {
    await t?.close();
    for (const [key, value] of [["VAPID_PUBLIC_KEY", saved.pub], ["VAPID_PRIVATE_KEY", saved.priv]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  /** Senders that count what went to whom and hold each run mid-send, so two runs overlap. */
  function senders(pushes: string[], hold: () => Promise<void>): MilestoneSenders {
    return {
      pushUsers: async () => new Set([id.saraUser]),
      push: async (_tx, payloads) => {
        await hold();
        for (const [user, p] of payloads) pushes.push(`${user}: ${p.title}`);
        return new Set(payloads.keys());
      },
      appUrl: "https://app.example",
    };
  }

  it("two admins add the same term of sessions at the same moment: each date is added once", async () => {
    const run: NewSessions = {
      kind: "training",
      title: "Training",
      venue: "Bobby Moore Sports Hub",
      groups: ["U7", "U10"],
      times: [0, 7, 14].map((d) => ({ start: new Date(Date.UTC(2026, 11, 4 + d, 18, 30)), end: new Date(Date.UTC(2026, 11, 4 + d, 19, 30)) })),
      arriveBy: null,
      kit: null,
      notes: null,
    };
    const hold = meet();
    const results = await Promise.all(
      [1, 2].map(() =>
        t.asUser(adminUser, async (tx) => {
          const result = await addSessionRun(tx, run);
          await hold();
          return result;
        }),
      ),
    );
    const [{ n }] = await t.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from sessions where title = 'Training'`));
    expect(n).toBe(3);
    // One of them added all three; the other was told they already existed.
    expect(results.map((r) => r.added.length).sort()).toEqual([0, 3]);
    expect(results.map((r) => r.skipped.length).sort()).toEqual([0, 3]);
  });

  it("the 20-point reward, reached overnight: a coach's tap and the hourly job at the same moment in the morning notify the parent once", async () => {
    // Reached in quiet hours, so it's recorded and nobody has been told yet.
    await t.asSystem(async (tx) => {
      await tx.query(`insert into player_awards (player_id, stars, points, parents_told_at) values ($1, 0, 20, now())`, [id.musa]);
      await tx.query(`insert into points_milestones (player_id, points, reached_at) values ($1, 20, $2)`, [id.musa, new Date(DAY.getTime() - 12 * 3_600_000)]);
    });
    const pushes: string[] = [];
    const hold = meet();
    await Promise.all([1, 2].map(() => t.asSystem((tx) => sendMilestoneNotices(tx, DAY, senders(pushes, hold)))));
    expect(pushes.filter((p) => p.includes("Masha'Allah"))).toHaveLength(1);
  });

  it("stars and points: two runs of the hourly job at the same moment tell the parent once", async () => {
    await t.asSystem((tx) => tx.query(`insert into player_awards (player_id, stars, points, reason, created_at) values ($1, 1, 0, 'Great passing', $2)`, [id.musa, new Date(DAY.getTime() - 3_600_000)]));
    const pushes: string[] = [];
    const hold = meet();
    await Promise.all([1, 2].map(() => t.asSystem((tx) => sendAwardNotices(tx, DAY, senders(pushes, hold)))));
    expect(pushes).toHaveLength(1);
  });

  it("Send a reminder now, pressed by two coaches at the same moment, buzzes each parent once", async () => {
    const news = await t.asSystem(
      async (tx) =>
        (await tx.query<{ id: string }>(`insert into announcements (topic, title, body, requires_ack, posted_by) values ('General', 'Kit day', 'Bring kit.', true, $1) returning id`, [id.admin]))[0].id,
    );
    const sent: string[] = [];
    const hold = meet();
    const send: PushSend = async (sub) => {
      await hold();
      sent.push(sub.endpoint);
    };
    const results = await Promise.all([1, 2].map(() => t.asSystem((tx) => nudgeUnread(tx, { newsId: news, title: "Kit day", guardianIds: [id.sara], now: DAY, send }))));
    expect(sent).toEqual(["https://push.example/sara"]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: "wait" });
  });

  it("already safe, and kept so: a child marked here twice, and their fee taken twice, at the same moment count once", async () => {
    const now = new Date();
    const session = await t.asSystem(
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'Gate', $1, $2, 'Hub', '{U7}') returning id`,
            [now, new Date(now.getTime() + 3_600_000)],
          )
        )[0].id,
    );
    const hold = meet();
    await Promise.all(
      [1, 2].map(() =>
        t.asUser(adminUser, async (tx) => {
          expect(await markHere(tx, session, id.musa, now)).toEqual({});
          expect(await takeGatePayment(tx, session, { playerId: id.musa }, id.admin, now)).toEqual({});
          await hold();
        }),
      ),
    );
    const [counts] = await t.asSystem((tx) =>
      tx.query<{ here: number; paid: number }>(
        `select (select count(*)::int from attendance where session_id = $1) as here, (select count(*)::int from session_payments where session_id = $1) as paid`,
        [session],
      ),
    );
    expect(counts).toEqual({ here: 1, paid: 1 });
  });

  it("every connection carries the time limits, so a stuck statement or a forgotten transaction gives its connection back", async () => {
    const [limits] = await t.asSystem((tx) =>
      tx.query<{ statement: string; idle: string }>(
        `select current_setting('statement_timeout') as statement, current_setting('idle_in_transaction_session_timeout') as idle`,
      ),
    );
    expect(limits).toEqual({ statement: "5min", idle: "15min" });
    // And a statement over the limit is ended, not left running (shortened here to keep the test quick).
    await expect(
      t.asSystem(async (tx) => {
        await tx.query(`set local statement_timeout = '200ms'`);
        await tx.query(`select pg_sleep(2)`);
      }),
    ).rejects.toThrow(/statement timeout/);
    expect(await t.asSystem((tx) => tx.query<{ one: number }>(`select 1 as one`))).toEqual([{ one: 1 }]);
  });
});
