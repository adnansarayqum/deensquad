import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { loadNotificationParents, sendNotificationHelp } from "./notifications";

// The App notifications page's lists and the "how to turn them on" email (migration 0045).

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let adnan: string;
const outbox = process.env.EMAIL_OUTBOX ?? ".data/outbox.jsonl";
const mails = () => {
  try {
    return readFileSync(outbox, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string });
  } catch {
    return [];
  }
};

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
  adnan = await t.signIn(DEV_EMAILS.parent);
  rmSync(outbox, { force: true });
});

describe("app notifications lists", () => {
  it("sorts parents into on, off and not on the app, with their children", async () => {
    await t.signIn(DEV_EMAILS.secondParent);
    await t.asSystem((tx) => tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/x', 'k', 'a')`, [adnan]));
    const lists = await t.asUser(admin, (tx) => loadNotificationParents(tx, null));
    expect(lists.on.map((p) => p.id)).toEqual([DEV_IDS.adnan]);
    expect(lists.off.map((p) => p.id)).toEqual([DEV_IDS.sara]);
    expect(lists.on[0].children.map((c) => c.name).sort()).toEqual(["Musa Sample", "Yusuf Sample"]);
    expect(lists.notIn.length).toBeGreaterThan(10);
    // A U7 coach sees only parents with a child in U7.
    const u7 = await t.asUser(admin, (tx) => loadNotificationParents(tx, ["U7"]));
    expect([...u7.on, ...u7.off, ...u7.notIn].every((p) => p.children.some((c) => c.group === "U7"))).toBe(true);
  });

  it("emails parents with notifications off once a week, never those with them on", async () => {
    await t.signIn(DEV_EMAILS.secondParent);
    await t.asSystem((tx) => tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/x', 'k', 'a')`, [adnan]));
    const ids = [DEV_IDS.adnan, DEV_IDS.sara];
    const first = await t.asSystem((tx) => sendNotificationHelp(tx, { guardianIds: ids, baseUrl: "https://app.example" }));
    expect(first).toEqual({ sent: 1, failed: 0, skipped: 1 });
    expect(mails().map((m) => m.to)).toEqual([DEV_EMAILS.secondParent]);
    expect(mails()[0].subject).toMatch(/notifications/);
    // The same day again: Sara was emailed in the last week, so nobody is.
    const again = await t.asSystem((tx) => sendNotificationHelp(tx, { guardianIds: ids, baseUrl: "https://app.example" }));
    expect(again).toEqual({ sent: 0, failed: 0, skipped: 2 });
    // Eight days on, she can be emailed again.
    const later = await t.asSystem((tx) => sendNotificationHelp(tx, { guardianIds: ids, baseUrl: "https://app.example", now: new Date(Date.now() + 8 * 86_400_000) }));
    expect(later.sent).toBe(1);
  });
});
