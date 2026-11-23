import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { AGE_GROUPS } from "../domain";
import { loadNewsDetail } from "../admin/data";
import { busiestHours, loadAppUse, visitLength } from "./data";
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
    const again = await t.asUser(admin, (tx) => loadAppUse(tx, [...AGE_GROUPS]));
    expect(again.quiet.map((q) => q.id)).toContain(DEV_IDS.sara);
    expect(again.quiet.map((q) => q.id)).not.toContain(DEV_IDS.adnan);
    const [row] = await t.asSystem((tx) => tx.query<{ opens: number }>(`select opens from app_opens where guardian_id = $1`, [DEV_IDS.adnan]));
    expect(row.opens).toBe(2);
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
