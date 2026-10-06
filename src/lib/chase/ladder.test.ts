import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { inQuietHours, runLadder, type ChaseTarget, type Senders } from "./ladder";
import { liveSenders } from "./senders";

// The sample club: the U10 kit message was posted 3 hours before `seeded`, unread by everyone.
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
    expect(kit).toHaveLength(17); // 16 U10 children: Yusuf has two parents, the rest one each
    expect(result.email).toBe(17);
    expect((await run(hoursLater(26))).email).toBe(0);
  });

  it("stops chasing a parent once their child's other parent reads it", async () => {
    const [kit] = await t.asSystem((tx) => tx.query<{ id: string }>("select id from announcements where title like 'New away kit%'"));
    await t.asSystem((tx) => tx.query("insert into announcement_reads (announcement_id, guardian_id) values ($1, $2)", [kit.id, DEV_IDS.sara]));
    await run(hoursLater(25));
    expect(sent.email.filter((x) => x.announcementId === kit.id).map((x) => x.firstName)).not.toContain("Adnan");
  });

  it("doesn't chase a parent added after the message was posted (they can still read it in News)", async () => {
    // A family imported an hour after `seeded`: after both unread messages were posted.
    await t.asSystem(async (tx) => {
      const [{ id: child }] = await tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group) values ('Late', 'Comer', 'U10') returning id`);
      const [{ id: parent }] = await tx.query<{ id: string }>(
        `insert into guardians (first_name, last_name, email, phone, created_at) values ('Lena', 'Comer', 'lena@example.com', '07700 900999', $1) returning id`,
        [hoursLater(1)],
      );
      await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [child, parent]);
    });
    const lena = await t.signIn("lena@example.com");
    await run(hoursLater(2), senders([adnanUser, lena], true));
    await run(hoursLater(25), senders([adnanUser, lena], true));
    await run(hoursLater(51), senders([adnanUser, lena], true));
    for (const channel of ["app", "email", "sms"]) {
      expect(names(sent[channel]), channel).not.toContain("Lena");
      expect(sent[channel]?.length ?? 0, channel).toBeGreaterThan(0); // the ladder still ran for everyone else
    }
    // Lena still sees both messages in News.
    const news = await t.asUser(lena, (tx) => tx.query<{ title: string }>(`select title from announcements order by posted_at desc`));
    expect(news.map((n) => n.title)).toContain("New away kit: sizes needed by Friday");
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

describe("chase ladder when sending fails", () => {
  const count = (sql: string) => t.asSystem(async (tx) => (await tx.query<{ n: number }>(sql))[0].n);
  const chases = (channel: string) => count(`select count(*)::int as n from announcement_chases where channel::text = '${channel}'`);
  const reminderLinks = () => count(`select count(*)::int as n from auth.sign_in_requests where purpose = 'invite'`);

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the app reminders it sent when the email step throws, so they don't go again", async () => {
    const pushes: ChaseTarget[] = [];
    const failing: Senders = {
      pushUsers: async () => new Set([adnanUser]),
      app: async (x) => {
        pushes.push(...x);
        return x;
      },
      email: async () => {
        throw new Error("Resend refused the email (429)");
      },
    };
    expect(await run(seeded, failing)).toMatchObject({ app: 1, email: 0, failed: ["email"] });
    expect(await chases("app")).toBe(1);
    expect(await run(hoursLater(1), failing)).toMatchObject({ app: 0, failed: ["email"] });
    expect(await run(hoursLater(2), failing)).toMatchObject({ app: 0 });
    expect(pushes).toHaveLength(1);
    expect(await chases("email")).toBe(0);
  });

  it("survives a failed statement in one step (which would abort the whole transaction)", async () => {
    const s: Senders = {
      ...senders(),
      email: async (_x, tx) => {
        await tx.query("select 1 / 0");
        return [];
      },
    };
    expect(await run(seeded, s)).toMatchObject({ app: 1, failed: ["email"] });
    expect(await chases("app")).toBe(1);
  });

  describe("live email sender", () => {
    beforeEach(() => {
      vi.stubEnv("RESEND_API_KEY", "test");
      vi.stubEnv("APP_URL", "https://app.test");
    });
    const resendOk = () => vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

    it("logs the emails that went and keeps their sign-in links", async () => {
      resendOk();
      const before = await reminderLinks();
      const result = await run(seeded, liveSenders());
      expect(result.email).toBe(19);
      expect(await chases("email")).toBe(19);
      // None of these 19 parents has signed in yet, so each email carried a sign-in link, and it was kept.
      expect(await reminderLinks()).toBe(before + 19);
    });

    it("treats a hanging or refused email as not sent, finishes the run, and tries again next time", async () => {
      const real = AbortSignal.timeout.bind(AbortSignal);
      vi.spyOn(AbortSignal, "timeout").mockImplementation(() => real(20));
      vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))));
      const before = await reminderLinks();
      expect(await run(seeded, liveSenders())).toMatchObject({ email: 0, failed: [] });
      expect(await chases("email")).toBe(0);
      expect(await reminderLinks()).toBe(before); // no links left behind for emails that didn't go

      vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
      expect((await run(hoursLater(1), liveSenders())).email).toBe(0);

      resendOk();
      expect((await run(hoursLater(2), liveSenders())).email).toBe(19);
      expect(await chases("email")).toBe(19);
    });
  });
});
