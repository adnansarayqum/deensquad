import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import { loadNewsDetail, loadNewsList } from "./data";

// A club-wide message read by Adnan (Yusuf U10, Musa U7). A U7 coach sees read counts for U7 parents only,
// so the bar agrees with their "Not read yet" list; an admin sees the whole club.

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;
let admin: string;
let message: string;

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  const adnan = await t.signIn(DEV_EMAILS.parent);
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
  [{ id: message }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`insert into announcements (topic, title, body, requires_ack) values ('Club', 'Winter timings', 'From November.', true) returning id`),
  );
  await t.asUser(adnan, (tx) => tx.query(`insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id())`, [message]));
});

describe("read counts on a club-wide message", () => {
  it("count only a group coach's own groups, and match the unread list", async () => {
    const mine = (await t.asUser(coach, (tx) => loadNewsDetail(tx, message, ["U7"])))!;
    const club = (await t.asUser(admin, (tx) => loadNewsDetail(tx, message, null)))!;
    expect(mine.news.groupsOnly).toBe(true);
    expect(club.news.groupsOnly).toBe(false);
    expect(mine.news.readCount).toBe(1);
    expect(mine.news.audienceCount).toBeLessThan(club.news.audienceCount);
    expect(mine.news.audienceCount - mine.news.readCount).toBe(mine.unread.length);
    expect(club.news.audienceCount - club.news.readCount).toBe(club.unread.length);
  });

  it("use the same counts on the news list", async () => {
    const mine = (await t.asUser(coach, (tx) => loadNewsList(tx, 50, ["U7"]))).find((n) => n.id === message)!;
    const detail = (await t.asUser(coach, (tx) => loadNewsDetail(tx, message, ["U7"])))!;
    expect([mine.readCount, mine.audienceCount, mine.groupsOnly]).toEqual([detail.news.readCount, detail.news.audienceCount, true]);
    const club = (await t.asUser(admin, (tx) => loadNewsList(tx, 50, null))).find((n) => n.id === message)!;
    expect(club.groupsOnly).toBe(false);
  });
});
