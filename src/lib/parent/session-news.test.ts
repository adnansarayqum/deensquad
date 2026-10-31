import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { cancelSession, postSessionNotice } from "../admin/sessions";
import { insertNews } from "../admin/news";
import { nextFridaySession } from "../dates";
import { DEV_EMAILS } from "../db/dev-seed";
import { loadFamily, loadNews, saveAnswer } from "./data";

// News about a session (migration 0040): cancelled / back on / changed notices name their session, older ones are
// marked out of date and stop asking to be read, and a "Who's coming?" post is answered with Coming / Not coming.

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let parent: string;
let staffId: string;
let friday: string;
const now = new Date();

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
  admin = await t.signIn(DEV_EMAILS.admin);
  parent = await t.signIn(DEV_EMAILS.parent);
  [{ id: staffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  [{ id: friday }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where starts_at = $1`, [nextFridaySession(now).start]));
});

const parentNews = () =>
  t.asUser(parent, async (tx) => {
    const family = (await loadFamily(tx))!;
    return { family, news: await loadNews(tx, family) };
  });

describe("session notices", () => {
  it("cancelled, back on, cancelled: only the last is current, the earlier two are out of date and no longer ask to be read", async () => {
    const ids: string[] = [];
    for (const [cancel, kind] of [[true, "cancelled"], [false, "restored"], [true, "cancelled"]] as const) {
      await t.asUser(admin, async (tx) => {
        await cancelSession(tx, friday, cancel, null);
        await tx.query(`select pg_sleep(0.01)`);
        ids.push((await postSessionNotice(tx, friday, kind, staffId))!);
      });
    }
    const { news } = await parentNews();
    const mine = ids.map((id) => news.find((n) => n.id === id)!);
    expect(mine.map((n) => n.session?.latest)).toEqual([false, false, true]);
    expect(mine.every((n) => n.session?.cancelled)).toBe(true);
    // Only the newest still waits for a tap; the older two sit read under Earlier.
    expect(mine.map((n) => n.read)).toEqual([true, true, false]);
  });
});

describe("a Who's coming? post", () => {
  it("asks about the family's children in the session, and answering counts as read", async () => {
    const id = await t.asUser(admin, (tx) =>
      insertNews(tx, { topic: "Training", title: "Who's coming on Friday?", body: "Please say.", audience: null, requiresAck: true, postedBy: staffId, squadSession: null, children: null, comingTo: friday }),
    );
    const { family, news } = await parentNews();
    const post = news.find((n) => n.id === id)!;
    expect(post.session?.notice).toBe("attendance");
    expect(post.read).toBe(false);
    expect(post.session?.children.length).toBeGreaterThan(0);
    const child = post.session!.children[0];
    expect(family.children.some((c) => c.id === child)).toBe(true);

    expect(await t.asUser(parent, (tx) => saveAnswer(tx, friday, child, "coming"))).toBe(true);
    const after = (await parentNews()).news.find((n) => n.id === id)!;
    expect(after.read).toBe(true);
  });
});

describe("deleting a session", () => {
  it("keeps its notices as plain news", async () => {
    const id = await t.asUser(admin, async (tx) => {
      await cancelSession(tx, friday, true, null);
      return (await postSessionNotice(tx, friday, "cancelled", staffId))!;
    });
    await t.asSystem((tx) => tx.query(`delete from sessions where id = $1`, [friday]));
    const post = (await parentNews()).news.find((n) => n.id === id)!;
    expect(post.session).toBeNull();
  });
});
