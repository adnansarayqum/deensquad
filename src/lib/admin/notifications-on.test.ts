import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { loadChild } from "./data";
import { NEEDS } from "./needs";

// Which parents have app notifications on (migration 0044): staff see yes or no per parent, never the device.

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let adnan: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
  adnan = await t.signIn(DEV_EMAILS.parent);
});

const notifOff = () =>
  t.asUser(admin, (tx) => tx.query<{ id: string }>(`select p.id from players p where ${NEEDS.notifoff.where} order by p.id`)).then((r) => r.map((x) => x.id));

describe("notifications on or off", () => {
  it("shows a parent with a device as on, lists the family under Notifications off until then", async () => {
    let child = (await t.asUser(admin, (tx) => loadChild(tx, DEV_IDS.yusuf)))!;
    expect(child.guardians.find((g) => g.id === DEV_IDS.adnan)!.notifications).toBe(false);
    expect(await notifOff()).toContain(DEV_IDS.yusuf);

    await t.asSystem((tx) => tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/x', 'k', 'a')`, [adnan]));
    child = (await t.asUser(admin, (tx) => loadChild(tx, DEV_IDS.yusuf)))!;
    expect(child.guardians.find((g) => g.id === DEV_IDS.adnan)!.notifications).toBe(true);
    expect(await notifOff()).not.toContain(DEV_IDS.yusuf);
  });

  it("tells a parent only about themselves", async () => {
    await t.asSystem((tx) => tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/x', 'k', 'a')`, [adnan]));
    const [self] = await t.asUser(adnan, (tx) => tx.query<{ on: boolean }>(`select guardian_notifications_on($1) as on`, [DEV_IDS.adnan]));
    expect(self.on).toBe(true);
    const sara = await t.signIn(DEV_EMAILS.secondParent);
    const [other] = await t.asUser(sara, (tx) => tx.query<{ on: boolean }>(`select guardian_notifications_on($1) as on`, [DEV_IDS.adnan]));
    expect(other.on).toBe(false);
  });
});
