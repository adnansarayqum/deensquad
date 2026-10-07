import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "../../../test/db";
import { pushToUsers, type PushSend } from "./senders";

// Pushes go out from 10 workers at once, and only then are devices updated or forgotten, one statement at a time.
let t: Awaited<ReturnType<typeof testDatabase>>;
let users: string[];
const saved = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
const payload = { title: "Deen Squad: please read", body: "Meet at 9", url: "/news" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pushError = (statusCode: number) => Object.assign(new Error(`push service said ${statusCode}`), { statusCode });

beforeAll(() => {
  // A fake sender is passed in, so the keys only need to be present.
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
  t = await testDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // 25 people with two devices each: 50 subscriptions.
  users = await t.asSystem(async (tx) => {
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const [{ id }] = await tx.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`parent${i}@example.com`]);
      for (const d of ["a", "b"]) {
        await tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [id, `https://push.example/${i}${d}`]);
      }
      ids.push(id);
    }
    return ids;
  });
});

const endpoints = () => t.asSystem((tx) => tx.query<{ endpoint: string; seen: boolean }>(`select endpoint, last_success_at is not null as seen from push_subscriptions order by endpoint`));

describe("pushToUsers", () => {
  it("sends to many devices at once rather than one after another", async () => {
    let inFlight = 0;
    let most = 0;
    const send: PushSend = async () => {
      most = Math.max(most, ++inFlight);
      await sleep(150);
      inFlight--;
    };
    const started = Date.now();
    const reached = await t.asSystem((tx) => pushToUsers(tx, users, payload, send));
    const took = Date.now() - started;
    expect(reached).toEqual(new Set(users));
    expect(most).toBe(10); // 10 workers, never more at once
    expect(took).toBeLessThan(2500); // one after another would take 50 x 150 ms = 7.5 s
  });

  it("a hung push service holds up one worker, not everything sent after it", async () => {
    // Positions 1, 11 and 21 hang until a short fake timeout, the others answer quickly. With fixed
    // batches of 10 each hang would hold up its whole batch: three timeouts end to end.
    const TIMEOUT = 600;
    const hung = new Set(["https://push.example/0a", "https://push.example/5a", "https://push.example/10a"]);
    const send: PushSend = async (sub) => {
      if (hung.has(sub.endpoint)) {
        await sleep(TIMEOUT);
        throw new Error("timed out");
      }
      await sleep(30);
    };
    const subs = await t.asSystem((tx) => tx.query<{ endpoint: string }>(`select endpoint from push_subscriptions where user_id = any($1::uuid[])`, [users]));
    expect([0, 10, 20].map((i) => subs[i].endpoint)).toEqual([...hung]); // the order pushToUsers reads them in
    const started = Date.now();
    const reached = await t.asSystem((tx) => pushToUsers(tx, users, payload, send));
    const took = Date.now() - started;
    expect(reached).toEqual(new Set(users)); // each hung device's partner device got through
    expect(took).toBeGreaterThanOrEqual(TIMEOUT);
    expect(took).toBeLessThan(2 * TIMEOUT); // batches would take at least 3 x 600 ms
    const rows = await endpoints();
    expect(rows.filter((r) => !r.seen).map((r) => r.endpoint).sort()).toEqual([...hung].sort());
  });

  it("marks devices reached, forgets gone ones and counts a refused send as not reached", async () => {
    const send: PushSend = async (sub) => {
      if (sub.endpoint.endsWith("/0a") || sub.endpoint.endsWith("/0b")) throw pushError(410); // parent 0: both devices gone
      if (sub.endpoint.endsWith("/1a")) throw pushError(404); // parent 1: one gone, one fine
      if (sub.endpoint.endsWith("/2a") || sub.endpoint.endsWith("/2b")) throw pushError(500); // parent 2: service failed
      if (sub.endpoint.endsWith("/3a")) throw new Error("timed out"); // parent 3: one timed out, one fine
    };
    const reached = await t.asSystem((tx) => pushToUsers(tx, users, payload, send));
    expect(reached.has(users[0])).toBe(false);
    expect(reached.has(users[1])).toBe(true);
    expect(reached.has(users[2])).toBe(false);
    expect(reached.has(users[3])).toBe(true);
    expect(reached.size).toBe(23);

    const rows = await endpoints();
    const by = new Map(rows.map((r) => [r.endpoint.replace("https://push.example/", ""), r.seen]));
    expect(by.has("0a")).toBe(false);
    expect(by.has("0b")).toBe(false);
    expect(by.has("1a")).toBe(false);
    expect(by.get("1b")).toBe(true);
    expect(by.get("2a")).toBe(false); // kept, not marked: try again next time
    expect(by.get("2b")).toBe(false);
    expect(by.get("3a")).toBe(false);
    expect(by.get("3b")).toBe(true);
    expect(rows).toHaveLength(47);
    expect(rows.filter((r) => r.seen)).toHaveLength(44);
  });

  it("only sends to the people asked for", async () => {
    const sentTo: string[] = [];
    const send: PushSend = async (sub) => void sentTo.push(sub.endpoint);
    const reached = await t.asSystem((tx) => pushToUsers(tx, [users[4]], payload, send));
    expect(reached).toEqual(new Set([users[4]]));
    expect(sentTo.sort()).toEqual(["https://push.example/4a", "https://push.example/4b"]);
  });
});

describe("reminder emails", () => {
  it("carry the message + parent idempotency key, so a retried run can't email a parent twice", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    vi.stubEnv("APP_URL", "https://app.test");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    try {
      const { liveSenders } = await import("./senders");
      const target = (announcementId: string) => ({
        announcementId,
        title: "Kit day",
        body: "Bring kit",
        guardianId: "g-1",
        userId: users[0], // signed in: no sign-in link needed
        firstName: "Sara",
        email: "sara@example.com",
        phone: null,
        children: ["Yusuf"],
      });
      const send = liveSenders().email!;
      await t.asSystem((tx) => send([target("a-1")], tx));
      await t.asSystem((tx) => send([target("a-2")], tx));
      const keys = fetch.mock.calls.map((c) => new Headers((c as unknown as [string, RequestInit])[1].headers).get("Idempotency-Key"));
      expect(keys).toEqual(["a-1:g-1:email", "a-2:g-1:email"]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
