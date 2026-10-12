import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import type { Email } from "../email/send";
import { DEFAULT_ATTENDANCE_REMINDER, attendanceReminderSetting, setAttendanceReminder } from "../settings";
import { lastReminderSent, reminderDue, reminderMessage, reminderWhen, sendAttendanceReminders, type ReminderItem, type ReminderSenders } from "./attendance";

// The weekly "Is <child> coming?" reminder. Dates: Wed 14 Oct 2026 is in BST (London = UTC+1); Wed 28 Oct 2026 is
// in GMT (the clocks go back on Sun 25 Oct).

const WED_BST_1707 = new Date("2026-10-14T16:07:00Z");

describe("when it's due", () => {
  const on = DEFAULT_ATTENDANCE_REMINDER;
  it("on the chosen London weekday from the chosen hour, in summer and winter time", () => {
    expect(reminderDue(on, new Date("2026-10-14T15:59:00Z"))).toBe(false); // 16:59 BST
    expect(reminderDue(on, new Date("2026-10-14T16:00:00Z"))).toBe(true); // 17:00 BST
    expect(reminderDue(on, new Date("2026-10-14T19:07:00Z"))).toBe(true); // 20:07 BST: a later run the same day
    expect(reminderDue(on, new Date("2026-10-28T16:07:00Z"))).toBe(false); // 16:07 GMT
    expect(reminderDue(on, new Date("2026-10-28T17:07:00Z"))).toBe(true); // 17:07 GMT
  });
  it("never on another day, never in quiet hours, never when switched off", () => {
    expect(reminderDue(on, new Date("2026-10-15T16:07:00Z"))).toBe(false); // Thursday
    expect(reminderDue(on, new Date("2026-10-13T16:07:00Z"))).toBe(false); // Tuesday
    expect(reminderDue(on, new Date("2026-10-14T20:30:00Z"))).toBe(false); // 21:30 BST, quiet hours
    expect(reminderDue({ ...on, hour: 21 }, new Date("2026-10-14T20:30:00Z"))).toBe(false);
    // 00:30 London on Wednesday is still Tuesday in UTC: London's day counts (and it's quiet hours anyway).
    expect(reminderDue({ ...on, hour: 0 }, new Date("2026-10-13T23:30:00Z"))).toBe(false);
    expect(reminderDue({ ...on, hour: 8 }, new Date("2026-10-14T07:00:00Z"))).toBe(true); // 08:00 BST
    expect(reminderDue({ ...on, enabled: false }, WED_BST_1707)).toBe(false);
    expect(reminderDue({ ...on, day: 4 }, new Date("2026-10-15T16:07:00Z"))).toBe(true);
  });
  it("says when in words", () => {
    expect(reminderWhen(on)).toBe("Wednesdays at 5pm");
    expect(reminderWhen({ day: 4, hour: 12 })).toBe("Thursdays at 12pm");
    expect(reminderWhen({ day: 0, hour: 9 })).toBe("Sundays at 9am");
  });
});

describe("what it says", () => {
  const fri: ReminderItem = { sessionId: "a", playerId: "1", child: "Musa", title: "Training", startsAt: "2026-10-16T17:30:00.000Z", venue: "Bobby Moore Sports Hub", squad: false };
  it("one child, two children, a squad session, several sessions", () => {
    expect(reminderMessage([fri])).toEqual({ question: "Is Musa coming on Friday?", detail: "Training 6:30pm at Bobby Moore Sports Hub." });
    expect(reminderMessage([{ ...fri, child: "Yusuf", playerId: "2" }, fri]).question).toBe("Are Yusuf and Musa coming on Friday?");
    const cup = { ...fri, sessionId: "b", title: "Autumn Cup", startsAt: "2026-10-17T09:00:00.000Z", venue: "Venue to be confirmed", squad: true };
    expect(reminderMessage([cup])).toEqual({ question: "Can Musa play in Autumn Cup on Sat?", detail: "Autumn Cup 10:00am at Venue to be confirmed." });
    expect(reminderMessage([{ ...fri, venue: "TBC" }]).detail).toBe("Training 6:30pm.");
    expect(reminderMessage([{ ...cup, child: "Isa", playerId: "3" }, fri])).toEqual({ question: "Are Isa and Musa coming this week?", detail: "Please answer for each of them." });
  });
});

describe("who gets it", () => {
  let t: Awaited<ReturnType<typeof testDatabase>>;
  let adnanUser: string;
  let adminUser: string;
  let coachUser: string;
  const id: Record<string, string> = {};

  type Sent = { push: Map<string, { title: string; body: string; url: string }>[]; email: Email[] };
  function senders(sent: Sent, opts: { pushUsers?: string[]; pushFails?: boolean } = {}): ReminderSenders {
    return {
      pushUsers: async () => new Set(opts.pushUsers ?? [adnanUser]),
      push: async (_tx, payloads) => {
        sent.push.push(payloads);
        return opts.pushFails ? new Set() : new Set(payloads.keys());
      },
      email: async (emails) => {
        sent.email.push(...emails);
        return { sent: emails, failed: [] };
      },
      appUrl: "https://app.example",
    };
  }
  const fresh = (): Sent => ({ push: [], email: [] });
  const run = (now: Date, s: ReminderSenders) => t.asSystem((tx) => sendAttendanceReminders(tx, now, s));
  const logged = () =>
    t.asSystem((tx) => tx.query<{ session_id: string; guardian_id: string; channel: string }>(`select session_id, guardian_id, channel from attendance_reminders order by channel, guardian_id`));

  beforeAll(async () => {
    t = await testDatabase();
    await t.asSystem(async (tx) => {
      await tx.query(`insert into staff (email, display_name, role) values ('admin@x.test', 'Ibrahim Khan', 'admin'), ('coach@x.test', 'Coach Hamza', 'coach')`);
      const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params))[0].id;
      const guardian = (first: string, email: string) => one(`insert into guardians (first_name, last_name, email) values ($1, 'Test', $2) returning id`, [first, email]);
      const player = (first: string, group: string) => one(`insert into players (first_name, last_name, age_group) values ($1, 'Test', $2::age_group) returning id`, [first, group]);
      id.adnan = await guardian("Adnan", "adnan@x.test");
      id.sara = await guardian("Sara", "sara@x.test");
      id.nuhParent = await guardian("Maryam", "nuh@x.test");
      id.isaParent = await guardian("Hafsa", "isa@x.test");
      id.aliParent = await guardian("Khalid", "ali@x.test");
      id.yusuf = await player("Yusuf", "U10");
      id.musa = await player("Musa", "U7");
      id.nuh = await player("Nuh", "U7");
      id.isa = await player("Isa", "U10");
      id.ali = await player("Ali", "U12");
      const link = (p: string, g: string) => tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [p, g]);
      await link(id.yusuf, id.adnan);
      await link(id.yusuf, id.sara);
      await link(id.musa, id.adnan);
      await link(id.musa, id.sara);
      await link(id.nuh, id.nuhParent);
      await link(id.isa, id.isaParent);
      await link(id.ali, id.aliParent);
      const session = (title: string, kind: string, start: string, groups: string, cancelled = false) =>
        one(
          `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups, cancelled_at)
           values ($1::session_kind, $2, $3::timestamptz, $3::timestamptz + interval '90 minutes', 'Bobby Moore Sports Hub', $4::age_group[], $5) returning id`,
          [kind, title, start, groups, cancelled ? new Date() : null],
        );
      // Thursday: U7 training (cancelled) and a U10 cup with a squad of Isa only. Friday: U7 and U10 training.
      // Monday (5 London days on): U12 training, outside the window. Ali has nothing sooner.
      id.thuU7 = await session("Training", "training", "2026-10-15T17:30:00Z", "{U7}", true);
      id.cup = await session("Autumn Cup", "tournament", "2026-10-15T08:00:00Z", "{U10}");
      id.fri = await session("Training", "training", "2026-10-16T17:30:00Z", "{U7,U10}");
      id.mon = await session("Training", "training", "2026-10-19T17:30:00Z", "{U12}");
      await tx.query(`insert into session_squads (session_id, player_id) values ($1, $2)`, [id.cup, id.isa]);
      // Nuh's family has answered for Friday.
      await tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')`, [id.fri, id.nuh]);
    });
    adnanUser = await t.signIn("adnan@x.test");
    adminUser = await t.signIn("admin@x.test");
    coachUser = await t.signIn("coach@x.test");
  });

  beforeEach(async () => {
    await t.asSystem(async (tx) => {
      await tx.query(`delete from attendance_reminders`);
      await tx.query(`delete from club_settings`);
    });
  });

  it("one notification per parent covering their unanswered children: push where turned on, else email; answered, cancelled, other squads and later sessions left out", async () => {
    const sent = fresh();
    const result = await run(WED_BST_1707, senders(sent));
    expect(result).toEqual({ due: true, push: 1, email: 2 });
    // Adnan has push: one notification naming both children, for Friday.
    expect(sent.push).toHaveLength(1);
    expect([...sent.push[0]]).toEqual([
      [adnanUser, { title: "Are Musa and Yusuf coming on Friday?", body: "Training 6:30pm at Bobby Moore Sports Hub. Tap to answer.", url: "/friday" }],
    ]);
    // Sara (no app) and Isa's parent (the squad session) are emailed; Nuh's (answered) and Ali's (Monday) aren't.
    expect(sent.email.map((e) => [e.to, e.subject]).sort()).toEqual([
      ["isa@x.test", "Can Isa play in Autumn Cup on Thu?"],
      ["sara@x.test", "Are Musa and Yusuf coming on Friday?"],
    ]);
    const sara = sent.email.find((e) => e.to === "sara@x.test")!;
    expect(sara.idempotencyKey).toBe(`attendance:${id.fri}:${id.sara}`);
    expect(sara.text).toContain("https://app.example/friday");
    expect(sara.html).toContain("Answer now");
    expect(await logged()).toEqual(
      [
        { session_id: id.fri, guardian_id: id.adnan, channel: "app" },
        { session_id: id.fri, guardian_id: id.sara, channel: "email" },
        { session_id: id.cup, guardian_id: id.isaParent, channel: "email" },
      ].sort((a, b) => a.channel.localeCompare(b.channel) || a.guardian_id.localeCompare(b.guardian_id)),
    );

    // A second run the same day sends nothing more.
    const again = fresh();
    expect(await run(new Date("2026-10-14T17:07:00Z"), senders(again))).toEqual({ due: true, push: 0, email: 0 });
    expect(again.push).toHaveLength(0);
    expect(again.email).toHaveLength(0);

    // Staff see when it last went and to how many parents.
    expect(await t.asUser(adminUser, (tx) => lastReminderSent(tx))).toEqual({ at: WED_BST_1707.toISOString(), parents: 3 });
  });

  it("a parent who answered for one child is asked only about the other", async () => {
    await t.asSystem((tx) => tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'away')`, [id.fri, id.musa]));
    const sent = fresh();
    await run(WED_BST_1707, senders(sent));
    expect(sent.push[0].get(adnanUser)?.title).toBe("Is Yusuf coming on Friday?");
    await t.asSystem((tx) => tx.query(`delete from availability where session_id = $1 and player_id = $2`, [id.fri, id.musa]));
  });

  it("a failed push isn't logged, so the next run that day tries again", async () => {
    const sent = fresh();
    expect(await run(WED_BST_1707, senders(sent, { pushFails: true }))).toMatchObject({ push: 0, email: 2 });
    expect((await logged()).some((r) => r.guardian_id === id.adnan)).toBe(false);
    const retry = fresh();
    expect(await run(new Date("2026-10-14T17:07:00Z"), senders(retry))).toMatchObject({ push: 1, email: 0 });
  });

  it("without push, everyone with an email gets one", async () => {
    const sent = fresh();
    expect(await run(WED_BST_1707, senders(sent, { pushUsers: [] }))).toEqual({ due: true, push: 0, email: 3 });
    expect(sent.email.map((e) => e.to).sort()).toEqual(["adnan@x.test", "isa@x.test", "sara@x.test"]);
  });

  it("switched off, or on another day: nothing", async () => {
    const adminStaff = (await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = 'admin@x.test'`)))[0].id;
    await t.asUser(adminUser, (tx) => setAttendanceReminder(tx, { enabled: false, day: 3, hour: 17 }, adminStaff));
    expect(await t.asUser(adminUser, (tx) => attendanceReminderSetting(tx))).toEqual({ enabled: false, day: 3, hour: 17 });
    const sent = fresh();
    expect(await run(WED_BST_1707, senders(sent))).toEqual({ due: false, push: 0, email: 0 });
    await t.asUser(adminUser, (tx) => setAttendanceReminder(tx, { enabled: true, day: 4, hour: 18 }, adminStaff));
    expect(await run(WED_BST_1707, senders(sent))).toEqual({ due: false, push: 0, email: 0 });
    expect(sent.push).toHaveLength(0);
    expect(sent.email).toHaveLength(0);
    expect(await logged()).toHaveLength(0);
    // Thursday at 6pm it goes. The cup started that morning, so Isa's next session is Friday's U7 and U10 training,
    // and Monday is now within the 4 days, so Ali's parent is asked too.
    const thu = fresh();
    expect((await run(new Date("2026-10-15T17:07:00Z"), senders(thu))).due).toBe(true);
    expect(thu.email.map((e) => e.subject).sort()).toEqual(["Are Musa and Yusuf coming on Friday?", "Is Ali coming on Monday?", "Is Isa coming on Friday?"]);
  });

  it("only admins change the setting; parents can't read the log, staff can", async () => {
    const coachStaff = (await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = 'coach@x.test'`)))[0].id;
    await expect(t.asUser(coachUser, (tx) => setAttendanceReminder(tx, { enabled: false, day: 3, hour: 17 }, coachStaff))).rejects.toThrow();
    await run(WED_BST_1707, senders(fresh()));
    expect(await t.asUser(adnanUser, (tx) => tx.query(`select * from attendance_reminders`))).toHaveLength(0);
    expect(await t.asUser(coachUser, (tx) => tx.query(`select * from attendance_reminders`))).toHaveLength(3);
    await expect(t.asUser(adminUser, (tx) => tx.query(`delete from attendance_reminders`))).rejects.toThrow();
  });

  it("a removed session or parent takes its log rows with it", async () => {
    await run(WED_BST_1707, senders(fresh()));
    await t.asSystem((tx) => tx.query(`delete from guardians where id = $1`, [id.isaParent]));
    expect((await logged()).map((r) => r.guardian_id)).not.toContain(id.isaParent);
  });
});
