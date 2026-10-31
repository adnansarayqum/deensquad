import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import { loadNewsDetail } from "./data";
import { insertNews } from "./news";
import { countWithDevices, nudgeUnread } from "./nudge";
import type { PushSend } from "../chase/senders";

// "Send a reminder now" and the Read list on a message (Coach Javed's request, 31 Oct 2026).

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let parent: string;
let post: string;
const saved = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
const midday = new Date("2026-11-02T12:00:00Z");

beforeAll(() => {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
});
afterAll(() => {
  if (saved.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY = saved.pub;
  if (saved.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
  else process.env.VAPID_PRIVATE_KEY = saved.priv;
});

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
  parent = await t.signIn(DEV_EMAILS.parent);
  const [{ id: staffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  post = await t.asUser(admin, (tx) =>
    insertNews(tx, { topic: "General", title: "Kit day", body: "Bring kit.", audience: null, requiresAck: true, postedBy: staffId, squadSession: null, children: null }),
  );
});

describe("read and not read", () => {
  it("lists who has read it, and the reminder buzzes only those who haven't, once an hour", async () => {
    // Adnan reads it; everyone else hasn't.
    await t.asUser(parent, (tx) => tx.query(`insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id())`, [post]));
    const detail = (await t.asUser(admin, (tx) => loadNewsDetail(tx, post)))!;
    expect(detail.readers.map((r) => r.name)).toContain("Adnan Sample");
    const unread = detail.unread.filter((u) => !u.partnerRead).map((u) => u.id);
    expect(unread.length).toBeGreaterThan(0);
    expect(detail.readers.some((r) => unread.includes(r.id))).toBe(false);

    // Give one unread parent a device (signing them in links the account).
    const [target] = await t.asSystem((tx) => tx.query<{ id: string; email: string }>(`select id, email from guardians where id = any($1::uuid[]) order by email limit 1`, [unread]));
    const user = await t.signIn(target.email);
    await t.asSystem((tx) => tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/x', 'k', 'a')`, [user]));
    expect(await t.asSystem((tx) => countWithDevices(tx, unread))).toBe(1);

    const sent: string[] = [];
    const send: PushSend = async (sub) => void sent.push(sub.endpoint);
    const first = await t.asSystem((tx) => nudgeUnread(tx, { newsId: post, title: "Kit day", guardianIds: unread, now: midday, send }));
    expect(first).toEqual({ ok: true, reached: 1, noDevice: unread.length - 1 });
    expect(sent).toEqual(["https://push.example/x"]);
    // Logged as a reminder against that parent.
    const logged = await t.asSystem((tx) => tx.query<{ guardian_id: string }>(`select guardian_id from announcement_chases where announcement_id = $1 and channel::text = 'nudge'`, [post]));
    expect(logged.map((l) => l.guardian_id)).toEqual([target.id]);

    // Again within the hour: refused. At night: refused.
    expect(await t.asSystem((tx) => nudgeUnread(tx, { newsId: post, title: "Kit day", guardianIds: unread, now: new Date(midday.getTime() + 30 * 60_000), send }))).toEqual({ ok: false, reason: "wait" });
    expect(await t.asSystem((tx) => nudgeUnread(tx, { newsId: post, title: "Kit day", guardianIds: unread, now: new Date("2026-11-02T22:00:00Z"), send }))).toEqual({ ok: false, reason: "quiet" });
    // An hour later it goes again.
    const later = await t.asSystem((tx) => nudgeUnread(tx, { newsId: post, title: "Kit day", guardianIds: unread, now: new Date(midday.getTime() + 61 * 60_000), send }));
    expect(later.ok).toBe(true);
  });
});
