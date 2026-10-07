import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";
import { SESSION_COOKIE } from "./cookies";
import { createSession } from "./service";

// getCurrentUser: what one request costs, and that people added to the club after they first signed in are
// linked to that sign-in without signing in again.
const holder: { t?: Awaited<ReturnType<typeof testDatabase>>; statements: string[] } = { statements: [] };
const jar = new Map<string, string>();

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  asSystem: <T>(fn: (tx: Queryable) => Promise<T>) =>
    holder.t!.asSystem((tx) =>
      fn({
        ...tx,
        query: (sql: string, params?: unknown[]) => {
          holder.statements.push(sql);
          return tx.query(sql, params);
        },
      }),
    ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

const { getCurrentUser } = await import("./session");

let t: Awaited<ReturnType<typeof testDatabase>>;

async function signIn(email: string) {
  const userId = await t.signIn(email);
  const token = await t.asSystem((tx) => createSession(tx, userId, new Date()));
  jar.set(SESSION_COOKIE, token);
  return userId;
}

beforeAll(async () => {
  t = holder.t = await testDatabase({ seed: true });
});

beforeEach(() => {
  jar.clear();
  holder.statements = [];
});

describe("getCurrentUser", () => {
  it("costs a parent three statements: the session, their parent row and their staff row", async () => {
    await signIn(DEV_EMAILS.parent);
    const user = await getCurrentUser();
    expect(user).toMatchObject({ email: DEV_EMAILS.parent, guardian: { id: DEV_IDS.adnan, firstName: "Adnan" }, staff: null });
    expect(holder.statements).toHaveLength(3);
    expect(holder.statements.some((s) => s.includes("update guardians"))).toBe(false);
  });

  it("sees a parent made a coach on their next request, without signing in again", async () => {
    const userId = await signIn("newcoach@example.com");
    await t.asSystem((tx) =>
      tx.query(`insert into guardians (first_name, last_name, email) values ('Bilal', 'Khan', 'newcoach@example.com')`),
    );
    expect((await getCurrentUser())?.staff).toBeNull();
    // The admin adds them to the staff list (the same insert as addStaff).
    await t.asSystem((tx) => tx.query(`insert into staff (email, display_name, role, age_groups) values ('NewCoach@Example.com', 'Coach Bilal', 'coach', '{U10}')`));
    const user = await getCurrentUser();
    expect(user?.staff).toMatchObject({ role: "coach", displayName: "Coach Bilal", ageGroups: ["U10"] });
    const [row] = await t.asSystem((tx) => tx.query<{ auth_user_id: string }>(`select auth_user_id from staff where display_name = 'Coach Bilal'`));
    expect(row.auth_user_id).toBe(userId);
  });

  it("links a parent row written for someone already signed in, and relinks when their email is changed to one that is", async () => {
    const coachId = await signIn(DEV_EMAILS.coach);
    // Imported or signed up later as a parent too.
    const [g] = await t.asSystem((tx) =>
      tx.query<{ id: string; auth_user_id: string | null }>(
        `insert into guardians (first_name, last_name, email) values ('Coach', 'Parent', $1) returning id, auth_user_id`,
        [DEV_EMAILS.coach.toUpperCase()],
      ),
    );
    expect(g.auth_user_id).toBe(coachId);
    expect((await getCurrentUser())?.guardian).toMatchObject({ id: g.id });

    // An admin corrects a parent's email to one that has signed in before: the old sign-in is dropped, the new one linked.
    const adminId = await t.signIn(DEV_EMAILS.admin);
    await t.asSystem((tx) =>
      tx.query(
        `update guardians set auth_user_id = case when lower(email) = $2 then auth_user_id end, email = $2 where id = $1`,
        [g.id, DEV_EMAILS.admin],
      ),
    );
    const [after] = await t.asSystem((tx) => tx.query<{ auth_user_id: string | null }>(`select auth_user_id from guardians where id = $1`, [g.id]));
    expect(after.auth_user_id).toBe(adminId);
    // The person who lost it no longer has a parent row.
    expect((await getCurrentUser())?.guardian).toBeNull();
  });
});
