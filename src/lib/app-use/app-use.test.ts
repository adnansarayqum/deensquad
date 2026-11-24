import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { AGE_GROUPS } from "../domain";
import { loadNewsDetail } from "../admin/data";
import { busiestHours, loadAppUse, loadOpeners, visitLength, busiestDay, waitWords } from "./data";
import { markSeen, readFromNotification, recordOpen, recordTimeOnScreen } from "./record";

// App use and Seen (migration 0055, the owner's question, 23 Nov 2026).

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let adnan: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
  adnan = await t.signIn(DEV_EMAILS.parent);
});

const post = (title: string, extra = "", audience: string | null = null) =>
  t.asSystem(async (tx) => {
    const [a] = await tx.query<{ id: string }>(
      `insert into announcements (topic, title, body, audience, requires_ack${extra ? ", quick_answers" : ""})
       values ('General', $1, 'Body', $2::age_group[], true${extra ? `, '${extra}'::text[]` : ""}) returning id`,
      [title, audience ? `{${audience}}` : null],
    );
    return a.id;
  });

describe("seen", () => {
  it("marks only posts the parent can read, under their own name", async () => {
    const forAll = await post("For everyone");
    const forU12 = await post("U12 only", "", "U12");
    expect(await t.asUser(adnan, (tx) => markSeen(tx, [forAll, forU12]))).toBe(1);
    expect(await t.asUser(adnan, (tx) => markSeen(tx, [forAll]))).toBe(0);
    const rows = await t.asSystem((tx) => tx.query<{ guardian_id: string }>(`select guardian_id from announcement_views`));
    expect(rows).toEqual([{ guardian_id: DEV_IDS.adnan }]);
    // Another parent can't see who saw it; staff can.
    const sara = await t.signIn(DEV_EMAILS.secondParent);
    expect(await t.asUser(sara, (tx) => tx.query(`select 1 from announcement_views`))).toHaveLength(0);
    expect(await t.asUser(admin, (tx) => tx.query(`select 1 from announcement_views`))).toHaveLength(1);
  });

  it("shows seen-but-not-tapped on the announcement for staff", async () => {
    const id = await post("Kit sizes");
    await t.asUser(adnan, (tx) => markSeen(tx, [id]));
    const detail = (await t.asUser(admin, (tx) => loadNewsDetail(tx, id)))!;
    expect(detail.news.seenCount).toBe(1);
    expect(detail.news.readCount).toBe(0);
    expect(detail.unread.find((u) => u.id === DEV_IDS.adnan)!.seenAt).not.toBeNull();
  });
});

describe("Mark as read from a notification", () => {
  it("reads a plain post, marked as from the notification, and counts it seen", async () => {
    const id = await post("Winter timings");
    expect(await t.asUser(adnan, (tx) => readFromNotification(tx, id))).toBe(true);
    const detail = (await t.asUser(admin, (tx) => loadNewsDetail(tx, id)))!;
    expect(detail.readers.find((r) => r.id === DEV_IDS.adnan)!.fromNotification).toBe(true);
    expect(detail.news.seenCount).toBe(detail.news.readCount);
  });

  it("won't answer a post that asks a question", async () => {
    const id = await post("Can they play?", "{Yes,No}");
    expect(await t.asUser(adnan, (tx) => readFromNotification(tx, id))).toBe(false);
    expect(await t.asSystem((tx) => tx.query(`select 1 from announcement_reads where announcement_id = $1`, [id]))).toHaveLength(0);
  });

  it("can't read a post that isn't the parent's", async () => {
    const id = await post("U12 only", "", "U12");
    await expect(t.asUser(adnan, (tx) => readFromNotification(tx, id))).resolves.toBe(false);
  });
});

describe("app use", () => {
  it("counts parents opening the app, the club's average visit and who has gone quiet", async () => {
    await t.asSystem((tx) => recordOpen(tx, DEV_IDS.adnan));
    await t.asSystem((tx) => recordOpen(tx, DEV_IDS.adnan));
    await t.asSystem((tx) => recordTimeOnScreen(tx, 90));
    await t.asSystem((tx) => recordTimeOnScreen(tx, 99_999)); // capped at 30 minutes
    const use = await t.asUser(admin, (tx) => loadAppUse(tx, [...AGE_GROUPS]));
    expect(use.today).toBe(1);
    expect(use.week).toBe(1);
    expect(use.daily).toHaveLength(30);
    expect(use.daily.at(-1)!.parents).toBe(1);
    expect(use.visits).toBe(2);
    expect(use.averageSeconds).toBe(Math.round((90 + 1800) / 2));
    // Sara is signed in and hasn't opened it: quiet. Adnan opened it today: not.
    await t.signIn(DEV_EMAILS.secondParent);
    // Until opens have been recorded for 14 days, "no open on record" says nothing, so nobody is listed for it.
    const early = await t.asUser(admin, (tx) => loadAppUse(tx, [...AGE_GROUPS], "2999-01-01"));
    expect(early.quietFrom).toBe("2999-01-15");
    expect(early.quiet).toEqual([]);
    const again = await t.asUser(admin, (tx) => loadAppUse(tx, [...AGE_GROUPS], "2026-01-01"));
    expect(again.quietFrom).toBeNull();
    expect(again.quiet.map((q) => q.id)).toContain(DEV_IDS.sara);
    expect(again.quiet.map((q) => q.id)).not.toContain(DEV_IDS.adnan);
    const [row] = await t.asSystem((tx) => tx.query<{ opens: number }>(`select opens from app_opens where guardian_id = $1`, [DEV_IDS.adnan]));
    expect(row.opens).toBe(2);
    // By day of the week (Monday first): today's opens land on today's London weekday, as an average per such day.
    const dow = Number((await t.asSystem((tx) => tx.query<{ d: number }>(`select extract(isodow from (now() at time zone 'Europe/London')::date)::int as d`)))[0].d);
    expect(again.openDays).toHaveLength(7);
    expect(again.openDays[dow - 1]).toBeGreaterThan(0);
    expect(again.openDays.filter((n) => n > 0)).toHaveLength(1);
    expect(again.readDays).toHaveLength(7);
    // Coming back: nobody opened it the week before, and it isn't said at all until 14 days are on record.
    expect(again.comeBack).toEqual({ before: 0, returned: 0 });
    expect(early.comeBack).toBeNull();
  });

  it("names who opened the app, who didn't and who isn't on it", async () => {
    await t.signIn(DEV_EMAILS.parent);
    await t.asSystem((tx) => recordOpen(tx, DEV_IDS.adnan));
    await t.asSystem((tx) => recordOpen(tx, DEV_IDS.adnan));
    const who = await t.asUser(admin, (tx) => loadOpeners(tx, [...AGE_GROUPS], 7, "2026-01-01"));
    expect(who.opened.map((o) => o.id)).toEqual([DEV_IDS.adnan]);
    expect(who.opened[0]).toMatchObject({ days: 1, opens: 2, onApp: true });
    expect(who.opened[0].children).toMatch(/\(U\d+\)|\(Girls\)/);
    expect(who.notOpened.every((o) => o.onApp && o.days === 0)).toBe(true);
    expect(who.notOnApp.some((o) => o.id === DEV_IDS.sara)).toBe(true);
    expect(who.sinceStart).toBe(false);
    // A period reaching back before opens were recorded says so; one group lists only its own parents.
    expect((await t.asUser(admin, (tx) => loadOpeners(tx, [...AGE_GROUPS], 30, "2999-01-01"))).sinceStart).toBe(true);
    const u6 = await t.asUser(admin, (tx) => loadOpeners(tx, ["U6"], 7));
    expect([...u6.opened, ...u6.notOpened, ...u6.notOnApp].every((o) => o.children.includes("(U6)"))).toBe(true);
  });

  it("leaves a staff parent's visit out of the club's average, but counts their open", async () => {
    await t.asSystem((tx) => recordOpen(tx, DEV_IDS.adnan, false));
    const use = await t.asUser(admin, (tx) => loadAppUse(tx, [...AGE_GROUPS]));
    expect(use.today).toBe(1);
    expect(use.visits).toBe(0);
  });

  it("says how early families answer for a session, and how long a post waited to be read", async () => {
    const [s] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (title, starts_at, ends_at, age_groups, venue)
         values ('Answer test', now() - interval '3 hours', now() - interval '2 hours', '{U10}', 'Hub') returning id`,
      ),
    );
    await t.asSystem((tx) =>
      tx.query(`insert into availability (session_id, player_id, answer, answered_at) values ($1, $2, 'coming', now() - interval '2 days')`, [s.id, DEV_IDS.yusuf]),
    );
    const use = await t.asUser(admin, (tx) => loadAppUse(tx, ["U10"]));
    const row = use.answers.find((a) => a.id === s.id)!;
    expect(row.answered).toBe(1);
    expect(row.dayAhead).toBe(1);
    expect(row.children).toBeGreaterThanOrEqual(1);
    expect(waitWords(0)).toBe("under a minute");
    expect(waitWords(45)).toBe("45 minutes");
    expect(waitWords(180)).toBe("3 hours");
    expect(waitWords(4320)).toBe("3 days");
    expect(busiestDay([1, 2, 3, 4, 20, 1, 0])).toBe("Fridays");
    expect(busiestDay([5, 5, 0, 0, 0, 0, 0])).toBeNull();
    expect(busiestDay([1, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it("keeps app opens from parents and other families, and nobody signed in writes them", async () => {
    await t.asSystem((tx) => recordOpen(tx, DEV_IDS.adnan));
    const sara = await t.signIn(DEV_EMAILS.secondParent);
    expect(await t.asUser(sara, (tx) => tx.query(`select 1 from app_opens`))).toHaveLength(0);
    expect(await t.asUser(sara, (tx) => tx.query(`select 1 from app_use_daily`))).toHaveLength(0);
    await expect(t.asUser(adnan, (tx) => tx.query(`insert into app_opens (guardian_id, day) values ($1, current_date + 1)`, [DEV_IDS.adnan]))).rejects.toThrow();
  });

  it("says visits and the busiest reading hours in words", () => {
    expect(visitLength(45)).toBe("45 s");
    expect(visitLength(130)).toBe("2 min 10 s");
    const hours = Array.from({ length: 24 }, () => 0);
    hours[19] = 8;
    hours[20] = 6;
    expect(busiestHours(hours)).toBe("7pm to 9pm");
    expect(busiestHours(Array.from({ length: 24 }, () => 0))).toBeNull();
  });
});
