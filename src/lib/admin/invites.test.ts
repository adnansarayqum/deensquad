import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import { testDatabase } from "../../../test/db";

// sendInvites talks to the app's database; point it at a fresh test database instead.
const holder: { t?: Awaited<ReturnType<typeof testDatabase>> } = {};
vi.mock("../db", () => ({ asSystem: <T>(fn: (tx: Queryable) => Promise<T>) => holder.t!.asSystem(fn) }));

const { sendInvites } = await import("./invites");

let t: Awaited<ReturnType<typeof testDatabase>>;

beforeEach(async () => {
  t = holder.t = await testDatabase();
  await t.asSystem(async (tx) => {
    for (let i = 0; i < 150; i++) {
      const [p] = await tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group) values ('Child', $1, 'U10') returning id`, [`F${i}`]);
      const [g] = await tx.query<{ id: string }>(`insert into guardians (first_name, last_name, email) values ('Parent', $1, $2) returning id`, [`F${i}`, `parent${i}@example.com`]);
      await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [p.id, g.id]);
    }
  });
  vi.stubEnv("RESEND_API_KEY", "test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Resend stand-in: answers each request in turn with `ok` or a refusal, and records who was emailed. */
function resend(answers: boolean[]) {
  const delivered: string[] = [];
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const ok = answers[call++] ?? true;
      if (!ok) return new Response("rate limited", { status: 429 });
      const body = JSON.parse(String(init.body));
      delivered.push(...(Array.isArray(body) ? body : [body]).map((e: { to: string[] }) => e.to[0]));
      return new Response("{}", { status: 200 });
    }),
  );
  return delivered;
}

const invited = () => t.asSystem((tx) => tx.query<{ email: string }>(`select email from guardians where invited_at is not null order by email`));
const inviteLinks = () => t.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from auth.sign_in_requests where purpose = 'invite'`));

describe("sending invites", () => {
  it("marks only the parents whose batch went, and a retry emails just the rest", async () => {
    const first = resend([true, false]);
    expect(await sendInvites({ baseUrl: "https://app.test" })).toEqual({ sent: 100, failed: 50 });
    expect(first).toHaveLength(100);
    expect((await invited()).map((r) => r.email).sort()).toEqual([...first].sort());
    // Links for emails that never went are dropped.
    expect((await inviteLinks())[0].n).toBe(100);

    const second = resend([true]);
    expect(await sendInvites({ baseUrl: "https://app.test" })).toEqual({ sent: 50, failed: 0 });
    expect(second).toHaveLength(50);
    expect(second.filter((e) => first.includes(e))).toEqual([]);
    expect(await invited()).toHaveLength(150);
    expect((await inviteLinks())[0].n).toBe(150);
  });

  it("with a filter, emails only the parents of children in that list, and the banner's count matches", async () => {
    const { countUninvited } = await import("./data");
    await t.asSystem(async (tx) => {
      for (let i = 0; i < 3; i++) {
        const [p] = await tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group) values ('Older', $1, 'U12') returning id`, [`G${i}`]);
        const [g] = await tx.query<{ id: string }>(`insert into guardians (first_name, last_name, email) values ('Parent', $1, $2) returning id`, [`G${i}`, `u12parent${i}@example.com`]);
        await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [p.id, g.id]);
      }
      // A U10 parent who also has a U12 child is in the U12 list too.
      const [p] = await tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group) values ('Sibling', 'F0', 'U12') returning id`);
      await tx.query(`insert into player_guardians (player_id, guardian_id) select $1, id from guardians where email = 'parent0@example.com'`, [p.id]);
    });
    const u12 = { group: "U12" as const, need: null, search: null };
    expect(await t.asSystem((tx) => countUninvited(tx, u12))).toBe(4);
    expect(await t.asSystem((tx) => countUninvited(tx, { group: null, need: null, search: null }))).toBe(153);

    const delivered = resend([true]);
    expect(await sendInvites({ filter: u12, baseUrl: "https://app.test" })).toEqual({ sent: 4, failed: 0 });
    expect(delivered.sort()).toEqual(["parent0@example.com", "u12parent0@example.com", "u12parent1@example.com", "u12parent2@example.com"]);
    expect(await invited()).toHaveLength(4);
    expect(await t.asSystem((tx) => countUninvited(tx, u12))).toBe(0);

    // A name search narrows it further: only that family.
    const again = resend([true]);
    expect(await sendInvites({ filter: { group: "U10", need: null, search: "F149" }, baseUrl: "https://app.test" })).toEqual({ sent: 1, failed: 0 });
    expect(again).toEqual(["parent149@example.com"]);
  });

  it("reports a failed resend instead of throwing", async () => {
    resend([false]);
    const [g] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from guardians limit 1`));
    expect(await sendInvites({ guardianIds: [g.id], baseUrl: "https://app.test" })).toEqual({ sent: 0, failed: 1 });
    expect(await invited()).toHaveLength(0);
  });
});
