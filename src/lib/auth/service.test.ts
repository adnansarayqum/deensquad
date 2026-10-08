import { beforeEach, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";
import {
  LIMITS,
  MAX_CODE_ATTEMPTS,
  MAX_WRONG_CODES_PER_DAY,
  createSession,
  deleteSession,
  ensureBootstrapAdmin,
  issueSignIn,
  peekLink,
  readSession,
  verifyCode,
  verifyLink,
} from "./service";
import { maskEmail, normaliseEmail } from "./tokens";

let t: Awaited<ReturnType<typeof testDatabase>>;
const now = new Date("2026-10-05T18:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
});

async function issue(email: string = DEV_EMAILS.parent, at = now, ip: string | null = "1.2.3.4") {
  const result = await t.asSystem((tx) => issueSignIn(tx, { email, ip, now: at, purpose: "sign_in" }));
  if (!result.ok) throw new Error(result.reason);
  return result.request;
}

describe("sign-in codes", () => {
  it("signs a known parent in with the emailed code and links their record", async () => {
    const req = await issue();
    expect(req.code).toMatch(/^\d{6}$/);
    const result = await t.asSystem((tx) => verifyCode(tx, req.requestId, req.code!, later(2)));
    expect(result).toMatchObject({ ok: true, email: DEV_EMAILS.parent });
    const [g] = await t.asSystem((tx) => tx.query<{ auth_user_id: string }>("select auth_user_id from guardians where id = $1", [DEV_IDS.adnan]));
    expect(g.auth_user_id).toBe(result.ok ? result.userId : "");
  });

  it("does nothing for an email the club hasn't added", async () => {
    const result = await t.asSystem((tx) => issueSignIn(tx, { email: "stranger@example.org", ip: null, now, purpose: "sign_in" }));
    expect(result).toEqual({ ok: false, reason: "unknown" });
    const rows = await t.asSystem((tx) => tx.query("select 1 from auth.sign_in_requests"));
    expect(rows).toHaveLength(0);
  });

  it("refuses a wrong code, counts attempts, then locks the request", async () => {
    const req = await issue();
    const wrong = req.code === "000000" ? "111111" : "000000";
    const first = await t.asSystem((tx) => verifyCode(tx, req.requestId, wrong, later(1)));
    expect(first).toEqual({ ok: false, reason: "wrong", attemptsLeft: MAX_CODE_ATTEMPTS - 1 });
    for (let i = 1; i < MAX_CODE_ATTEMPTS; i++) await t.asSystem((tx) => verifyCode(tx, req.requestId, wrong, later(1)));
    const right = await t.asSystem((tx) => verifyCode(tx, req.requestId, req.code!, later(1)));
    expect(right).toEqual({ ok: false, reason: "too_many" });
  });

  it("stops codes for an address after a day's worth of wrong ones, across requests; the link still works", async () => {
    const perRequest = MAX_CODE_ATTEMPTS;
    for (let r = 0; r < MAX_WRONG_CODES_PER_DAY / perRequest; r++) {
      const req = await issue(DEV_EMAILS.parent, later(r * 61));
      const wrong = req.code === "000000" ? "111111" : "000000";
      for (let i = 0; i < perRequest; i++) await t.asSystem((tx) => verifyCode(tx, req.requestId, wrong, later(r * 61 + 1)));
    }
    const next = await issue(DEV_EMAILS.parent, later(400));
    expect(await t.asSystem((tx) => verifyCode(tx, next.requestId, next.code!, later(401)))).toEqual({ ok: false, reason: "locked" });
    expect((await t.asSystem((tx) => verifyLink(tx, next.token, later(401)))).ok).toBe(true);
  });

  it("expires after 15 minutes and can't be used twice", async () => {
    const a = await issue();
    expect(await t.asSystem((tx) => verifyCode(tx, a.requestId, a.code!, later(16)))).toEqual({ ok: false, reason: "expired" });
    const b = await issue();
    expect((await t.asSystem((tx) => verifyCode(tx, b.requestId, b.code!, later(1)))).ok).toBe(true);
    expect(await t.asSystem((tx) => verifyCode(tx, b.requestId, b.code!, later(2)))).toEqual({ ok: false, reason: "used" });
  });

  it("limits how many codes one email can ask for in an hour", async () => {
    for (let i = 0; i < LIMITS.perEmailPerHour; i++) await issue(DEV_EMAILS.parent, later(i));
    const blocked = await t.asSystem((tx) => issueSignIn(tx, { email: DEV_EMAILS.parent, ip: "9.9.9.9", now: later(10), purpose: "sign_in" }));
    expect(blocked).toEqual({ ok: false, reason: "rate_limited" });
    const nextHour = await t.asSystem((tx) => issueSignIn(tx, { email: DEV_EMAILS.parent, ip: "9.9.9.9", now: later(70), purpose: "sign_in" }));
    expect(nextHour.ok).toBe(true);
  });

  it("lets 500 codes an hour come from one address, since a few hundred families share a venue's wifi", async () => {
    const emails = await t.asSystem((tx) => tx.query<{ email: string }>(`select email from guardians where email like 'parent%' order by email`));
    expect(LIMITS.perIpPerHour).toBe(500);
    await t.asSystem((tx) =>
      tx.query(
        `insert into auth.sign_in_requests (email, purpose, link_hash, ip, created_at, expires_at)
         select 'someone' || n || '@example.com', 'sign_in', 'ip-' || n, '5.5.5.5', $1, $2 from generate_series(1, 499) n`,
        [later(1), later(16)],
      ),
    );
    const last = await t.asSystem((tx) => issueSignIn(tx, { email: emails[0].email, ip: "5.5.5.5", now: later(2), purpose: "sign_in" }));
    expect(last.ok).toBe(true);
    const blocked = await t.asSystem((tx) => issueSignIn(tx, { email: emails[1].email, ip: "5.5.5.5", now: later(3), purpose: "sign_in" }));
    expect(blocked).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("refuses sign-up 301 in an hour across the club, while parents the club has can still sign in", async () => {
    await t.asSystem((tx) =>
      tx.query(
        `insert into auth.sign_in_requests (email, purpose, link_hash, ip, created_at, expires_at, registration)
         select 'new' || n || '@example.org', 'sign_in', 'signup-' || n, 'ip-' || n, $1, $2, '{"firstName":"A","lastName":"B","phone":null,"children":[]}'::jsonb
         from generate_series(1, $3::int) n`,
        [later(1), later(16), LIMITS.signUpsPerHour],
      ),
    );
    const registration = { firstName: "Hana", lastName: "Rahman", phone: null, children: [{ firstName: "Ilyas", lastName: "Rahman", dateOfBirth: "2017-05-01", ageGroup: "U10" as const }] };
    const signUp = await t.asSystem((tx) => issueSignIn(tx, { email: "hana@example.com", ip: "7.7.7.7", now: later(5), purpose: "sign_in", registration }));
    expect(signUp).toEqual({ ok: false, reason: "rate_limited", clubWide: true });
    expect((await issue(DEV_EMAILS.parent, later(5))).code).toMatch(/^\d{6}$/);
    const nextHour = await t.asSystem((tx) => issueSignIn(tx, { email: "hana@example.com", ip: "7.7.7.7", now: later(62), purpose: "sign_in", registration }));
    expect(nextHour.ok).toBe(true);
  });
});

describe("sign-in links", () => {
  it("can be looked at without being used, then used once", async () => {
    const req = await issue(DEV_EMAILS.secondParent);
    expect(await t.asSystem((tx) => peekLink(tx, req.token, later(1)))).toEqual({ email: DEV_EMAILS.secondParent, purpose: "sign_in" });
    expect((await t.asSystem((tx) => verifyLink(tx, req.token, later(1)))).ok).toBe(true);
    expect(await t.asSystem((tx) => peekLink(tx, req.token, later(2)))).toBeNull();
    expect(await t.asSystem((tx) => verifyLink(tx, req.token, later(2)))).toEqual({ ok: false, reason: "used" });
  });

  it("keeps invite links working for a week", async () => {
    const result = await t.asSystem((tx) => issueSignIn(tx, { email: DEV_EMAILS.parent, ip: null, now, purpose: "invite" }));
    if (!result.ok) throw new Error("expected an invite");
    expect(result.request.code).toBeNull();
    expect((await t.asSystem((tx) => verifyLink(tx, result.request.token, later(6 * 24 * 60)))).ok).toBe(true);
  });
});

describe("first admin", () => {
  it("adds an ADMIN_EMAILS address as an admin so they can sign in", async () => {
    const email = "owner@club.example";
    await t.asSystem((tx) => ensureBootstrapAdmin(tx, email, new Set([email])));
    await t.asSystem((tx) => ensureBootstrapAdmin(tx, email, new Set([email])));
    const staff = await t.asSystem((tx) => tx.query<{ role: string; display_name: string }>("select role::text, display_name from staff where email = $1", [email]));
    expect(staff).toEqual([{ role: "admin", display_name: "Owner" }]);
    expect((await issue(email)).code).toBeTruthy();
  });
});

describe("sessions", () => {
  it("reads, slides and deletes a session", async () => {
    const req = await issue();
    const verified = await t.asSystem((tx) => verifyCode(tx, req.requestId, req.code!, later(1)));
    if (!verified.ok) throw new Error("expected sign-in");
    const token = await t.asSystem((tx) => createSession(tx, verified.userId, now));
    expect(await t.asSystem((tx) => readSession(tx, token, later(60)))).toEqual({ userId: verified.userId, email: DEV_EMAILS.parent });
    // Used again after 80 days: still valid, and the expiry moves out.
    expect(await t.asSystem((tx) => readSession(tx, token, later(80 * 24 * 60)))).not.toBeNull();
    expect(await t.asSystem((tx) => readSession(tx, token, later(160 * 24 * 60)))).not.toBeNull();
    await t.asSystem((tx) => deleteSession(tx, token));
    expect(await t.asSystem((tx) => readSession(tx, token, later(161 * 24 * 60)))).toBeNull();
    expect(await t.asSystem((tx) => readSession(tx, "made-up", now))).toBeNull();
  });
});

describe("email helpers", () => {
  it("normalises and masks addresses", () => {
    expect(normaliseEmail("  Adnan@Example.COM ")).toBe("adnan@example.com");
    expect(normaliseEmail("not an email")).toBeNull();
    expect(maskEmail("adnan@example.com")).toBe("a•••@example.com");
  });
});
