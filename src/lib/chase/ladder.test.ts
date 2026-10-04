import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { inQuietHours, runLadder, type ChaseTarget, type Senders } from "./ladder";

// The sample club: the U9 kit message was posted 3 hours before `seeded`, unread by everyone.
// "Winter timings" (74 hours old, all groups) has been read by Adnan, the other parent of Yusuf and Musa.
const seeded = new Date("2026-10-05T11:00:00Z"); // midday in London
const hoursLater = (h: number) => new Date(seeded.getTime() + h * 3600_000);

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnanUser: string;
let sent: Record<string, ChaseTarget[]>;

function senders(pushUsers: string[] = [adnanUser], withSms = false): Senders {
  const record = (channel: string) => async (targets: ChaseTarget[]) => {
    sent[channel] = [...(sent[channel] ?? []), ...targets];
    return targets;
  };
  return { pushUsers: async () => new Set(pushUsers), app: record("app"), email: record("email"), ...(withSms ? { sms: record("sms") } : {}) };
}

const run = (at: Date, s = senders()) => t.asSystem((tx) => runLadder(tx, at, s));
const names = (targets: ChaseTarget[] | undefined) => (targets ?? []).map((x) => x.firstName).sort();

beforeEach(async () => {
  t = await testDatabase({ seed: true, now: seeded });
  adnanUser = await t.signIn(DEV_EMAILS.parent);
  sent = {};
});

describe("chase ladder", () => {
  it("keeps quiet between 9pm and 8am London time", async () => {
    expect(inQuietHours(new Date("2026-10-05T20:30:00Z"))).toBe(true); // 21:30 BST
    expect(inQuietHours(new Date("2026-10-05T07:30:00Z"))).toBe(false); // 08:30 BST
    expect(inQuietHours(new Date("2026-12-05T07:30:00Z"))).toBe(true); // 07:30 GMT
    expect(await run(new Date("2026-10-05T22:00:00Z"))).toMatchObject({ quiet: true, app: 0, email: 0 });
  });

  it("notifies parents with notifications on, once", async () => {
    expect(await run(seeded)).toMatchObject({ app: 1 });
    expect(sent.app.map((x) => [x.firstName, x.title])).toEqual([["Adnan", "New away kit: sizes needed by Friday"]]);
    expect(await run(hoursLater(1))).toMatchObject({ app: 0 });
  });

  it("emails after 24 hours, skipping families where the other parent has read it", async () => {
    // "Winter timings" is already 74 hours old, so its reminders go at once; the kit message's wait until 24 hours.
    const early = await run(hoursLater(20));
    const winter = sent.email.filter((x) => x.title.startsWith("Winter"));
    expect(names(winter)).not.toContain("Sara"); // Adnan read it for their family
    expect(winter).toHaveLength(19);
    expect(early.email).toBe(19);
    const result = await run(hoursLater(25));
    const kit = sent.email.filter((x) => x.title.startsWith("New away kit"));
    expect(kit).toHaveLength(17); // 16 U9 children: Yusuf has two parents, the rest one each
    expect(result.email).toBe(17);
    expect((await run(hoursLater(26))).email).toBe(0);
  });

  it("stops chasing a parent once their child's other parent reads it", async () => {
    const [kit] = await t.asSystem((tx) => tx.query<{ id: string }>("select id from announcements where title like 'New away kit%'"));
    await t.asSystem((tx) => tx.query("insert into announcement_reads (announcement_id, guardian_id) values ($1, $2)", [kit.id, DEV_IDS.sara]));
    await run(hoursLater(25));
    expect(sent.email.filter((x) => x.announcementId === kit.id).map((x) => x.firstName)).not.toContain("Adnan");
  });

  it("texts after 48 hours only when texting is set up", async () => {
    await run(hoursLater(50));
    expect(sent.sms).toBeUndefined();
    sent = {};
    await run(hoursLater(51), senders([], true));
    expect(sent.sms?.length).toBeGreaterThan(0);
    expect(sent.sms!.every((x) => x.phone)).toBe(true);
  });

  it("leaves messages older than a week alone", async () => {
    await run(hoursLater(24 * 8));
    expect(sent.email ?? []).toHaveLength(0);
  });
});
