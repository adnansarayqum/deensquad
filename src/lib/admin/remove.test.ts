import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { deleteLeftoverAccounts, removeChildRecord, unlinkGuardianRecord } from "./remove";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
});

/** The child of a seeded one-parent family, by the parent's email. */
async function childOf(email: string): Promise<string> {
  const [row] = await t.asSystem((tx) =>
    tx.query<{ player_id: string }>(
      `select pg.player_id from player_guardians pg join guardians g on g.id = pg.guardian_id where g.email = $1`,
      [email],
    ),
  );
  return row.player_id;
}

/** Signs a parent in on a device with notifications on and a sign-in code outstanding, as a real parent would be. */
async function activeParent(email: string): Promise<string> {
  const userId = await t.signIn(email);
  await t.asSystem(async (tx) => {
    await tx.query(`insert into auth.sessions (id, user_id, expires_at) values ($1, $2, now() + interval '90 days')`, [`session-${email}`, userId]);
    await tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'key', 'auth')`, [userId, `https://push.example/${email}`]);
    await tx.query(
      `insert into auth.sign_in_requests (email, purpose, link_hash, created_at, expires_at) values ($1, 'sign_in', $2, now(), now() + interval '15 minutes')`,
      [email, `hash-${email}`],
    );
  });
  return userId;
}

async function traces(userId: string, email: string) {
  return t.asSystem(async (tx) => {
    const [row] = await tx.query<{ users: number; sessions: number; push: number; requests: number }>(
      `select
         (select count(*) from auth.users where id = $1)::int as users,
         (select count(*) from auth.sessions where user_id = $1)::int as sessions,
         (select count(*) from push_subscriptions where user_id = $1)::int as push,
         (select count(*) from auth.sign_in_requests where lower(email) = lower($2))::int as requests`,
      [userId, email],
    );
    return row;
  });
}

const kept = { users: 1, sessions: 1, push: 1, requests: 1 };
const gone = { users: 0, sessions: 0, push: 0, requests: 0 };

async function removeChild(child: string) {
  const removed = await t.asUser(admin, (tx) => removeChildRecord(tx, child));
  return t.asSystem((tx) => deleteLeftoverAccounts(tx, removed));
}

describe("removing a child", () => {
  it("deletes the account of a parent whose only child it was, with their devices, notifications and sign-in codes", async () => {
    const email = "parent1@example.com";
    const child = await childOf(email);
    const parent = await activeParent(email);
    expect(await removeChild(child)).toBe(1);
    expect(await traces(parent, email)).toEqual(gone);
  });

  it("keeps the account of a parent who is also on the staff", async () => {
    const email = "parent2@example.com";
    const child = await childOf(email);
    await t.asSystem((tx) => tx.query(`insert into staff (email, display_name, role) values ($1, 'Coach Parent', 'coach')`, [email]));
    const parent = await activeParent(email);
    expect(await removeChild(child)).toBe(0);
    expect(await traces(parent, email)).toEqual(kept);
  });

  it("keeps the account of a parent who still has another child at the club", async () => {
    const parent = await activeParent(DEV_EMAILS.parent);
    expect(await removeChild(DEV_IDS.yusuf)).toBe(0);
    expect(await traces(parent, DEV_EMAILS.parent)).toEqual(kept);
    const [g] = await t.asSystem((tx) => tx.query<{ auth_user_id: string }>(`select auth_user_id from guardians where id = $1`, [DEV_IDS.adnan]));
    expect(g.auth_user_id).toBe(parent);
  });

  it("keeps the account of a shared parent who is also a guardian in another family, and deletes the other parent's", async () => {
    const leaving = "parent3@example.com";
    const shared = "parent4@example.com";
    const child = await childOf(leaving);
    // parent4 is also a carer for parent3's child, and still has their own child at the club.
    await t.asSystem((tx) =>
      tx.query(`insert into player_guardians (player_id, guardian_id) select $1, id from guardians where email = $2`, [child, shared]),
    );
    const leavingId = await activeParent(leaving);
    const sharedId = await activeParent(shared);
    expect(await removeChild(child)).toBe(1);
    expect(await traces(leavingId, leaving)).toEqual(gone);
    expect(await traces(sharedId, shared)).toEqual(kept);
  });
});

describe("taking a parent off a child", () => {
  it("deletes the account of a parent left with no children, and keeps one who still has a child", async () => {
    const parent = await activeParent(DEV_EMAILS.secondParent);
    const once = await t.asUser(admin, (tx) => unlinkGuardianRecord(tx, DEV_IDS.yusuf, DEV_IDS.sara));
    expect(await t.asSystem((tx) => deleteLeftoverAccounts(tx, once))).toBe(0);
    expect(await traces(parent, DEV_EMAILS.secondParent)).toEqual(kept);

    const twice = await t.asUser(admin, (tx) => unlinkGuardianRecord(tx, DEV_IDS.musa, DEV_IDS.sara));
    expect(await t.asSystem((tx) => deleteLeftoverAccounts(tx, twice))).toBe(1);
    expect(await traces(parent, DEV_EMAILS.secondParent)).toEqual(gone);
  });

  it("clears the outstanding invite of a parent who never signed in", async () => {
    const email = "parent5@example.com";
    const child = await childOf(email);
    await t.asSystem((tx) =>
      tx.query(
        `insert into auth.sign_in_requests (email, purpose, link_hash, created_at, expires_at) values ($1, 'invite', 'invite-hash', now(), now() + interval '7 days')`,
        [email],
      ),
    );
    const [g] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from guardians where email = $1`, [email]));
    const removed = await t.asUser(admin, (tx) => unlinkGuardianRecord(tx, child, g.id));
    await t.asSystem((tx) => deleteLeftoverAccounts(tx, removed));
    const rows = await t.asSystem((tx) => tx.query(`select 1 from auth.sign_in_requests where email = $1`, [email]));
    expect(rows).toHaveLength(0);
  });
});
