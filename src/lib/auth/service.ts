import type { Queryable } from "../db/types";
import { codeHash, newCode, newToken, sameHash, sha256, UUID } from "./tokens";

// Email sign-in: a 6-digit code and a link in one email. Both are single-use and stored only as hashes.
// The code exists because an iPhone home-screen app doesn't share sign-in with Safari, so a parent
// who taps the link signs in Safari, not the app. Typing the code inside the app always works.

export const SIGN_IN_MINUTES = 15;
export const INVITE_DAYS = 7;
export const MAX_CODE_ATTEMPTS = 5;
export const SESSION_DAYS = 90;
export const LIMITS = { perEmailPerHour: 5, perIpPerHour: 30 };

export type IssuedRequest = { requestId: string; email: string; code: string | null; token: string; expiresAt: Date };

export type IssueResult =
  | { ok: true; request: IssuedRequest }
  | { ok: false; reason: "unknown" | "rate_limited" };

/** Someone the club has added: a parent or a member of staff. */
export async function isKnownEmail(tx: Queryable, email: string): Promise<boolean> {
  const rows = await tx.query(
    `select 1 from guardians where lower(email) = $1 union all select 1 from staff where lower(email) = $1 limit 1`,
    [email],
  );
  return rows.length > 0;
}

/** ADMIN_EMAILS lets the first admin in before anyone has been added through the app. */
export async function ensureBootstrapAdmin(tx: Queryable, email: string, adminEmails: ReadonlySet<string>): Promise<void> {
  if (!adminEmails.has(email)) return;
  const name = email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  await tx.query(
    `insert into staff (email, display_name, role) values ($1, $2, 'admin') on conflict ((lower(email))) do nothing`,
    [email, name || "Admin"],
  );
}

export async function issueSignIn(
  tx: Queryable,
  opts: { email: string; ip: string | null; now: Date; purpose: "sign_in" | "invite" },
): Promise<IssueResult> {
  const { email, ip, now, purpose } = opts;
  if (!(await isKnownEmail(tx, email))) return { ok: false, reason: "unknown" };

  if (purpose === "sign_in") {
    const hourAgo = new Date(now.getTime() - 3600_000);
    const [{ byEmail, byIp }] = await tx.query<{ byEmail: number; byIp: number }>(
      `select
         (select count(*) from auth.sign_in_requests where lower(email) = $1 and purpose = 'sign_in' and created_at > $2)::int as "byEmail",
         (select count(*) from auth.sign_in_requests where ip = $3 and purpose = 'sign_in' and created_at > $2)::int as "byIp"`,
      [email, hourAgo, ip ?? ""],
    );
    if (byEmail >= LIMITS.perEmailPerHour || (ip && byIp >= LIMITS.perIpPerHour)) return { ok: false, reason: "rate_limited" };
  }

  // Old requests are no use to anyone; keep the table small.
  await tx.query(`delete from auth.sign_in_requests where expires_at < $1`, [new Date(now.getTime() - 30 * 86400_000)]);

  const token = newToken();
  const code = purpose === "sign_in" ? newCode() : null;
  const expiresAt = new Date(now.getTime() + (purpose === "invite" ? INVITE_DAYS * 86400_000 : SIGN_IN_MINUTES * 60_000));
  const [{ id }] = await tx.query<{ id: string }>(
    `insert into auth.sign_in_requests (email, purpose, link_hash, ip, created_at, expires_at) values ($1, $2, $3, $4, $5, $6) returning id`,
    [email, purpose, sha256(token), ip, now, expiresAt],
  );
  if (code) await tx.query(`update auth.sign_in_requests set code_hash = $2 where id = $1`, [id, codeHash(id, code)]);
  return { ok: true, request: { requestId: id, email, code, token, expiresAt } };
}

export type VerifyResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "wrong" | "expired" | "used" | "too_many"; attemptsLeft?: number };

type RequestRow = { id: string; email: string; code_hash: string | null; attempts: number; expires_at: Date; used_at: Date | null };

export async function verifyCode(tx: Queryable, requestId: string, code: string, now: Date): Promise<VerifyResult> {
  if (!UUID.test(requestId)) return { ok: false, reason: "wrong" };
  const [row] = await tx.query<RequestRow>(
    `select id, email, code_hash, attempts, expires_at, used_at from auth.sign_in_requests where id = $1 for update`,
    [requestId],
  );
  if (!row || !row.code_hash) return { ok: false, reason: "wrong" };
  const problem = checkUsable(row, now);
  if (problem) return { ok: false, reason: problem };
  if (row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, reason: "too_many" };
  if (!sameHash(row.code_hash, codeHash(row.id, code))) {
    await tx.query(`update auth.sign_in_requests set attempts = attempts + 1 where id = $1`, [row.id]);
    const left = MAX_CODE_ATTEMPTS - row.attempts - 1;
    return left > 0 ? { ok: false, reason: "wrong", attemptsLeft: left } : { ok: false, reason: "too_many" };
  }
  return finish(tx, row, now);
}

export async function verifyLink(tx: Queryable, token: string, now: Date): Promise<VerifyResult> {
  const [row] = await tx.query<RequestRow>(
    `select id, email, code_hash, attempts, expires_at, used_at from auth.sign_in_requests where link_hash = $1 for update`,
    [sha256(token)],
  );
  if (!row) return { ok: false, reason: "wrong" };
  const problem = checkUsable(row, now);
  if (problem) return { ok: false, reason: problem };
  return finish(tx, row, now);
}

/** Looks up a link without using it, so email scanners that open links can't spend it. */
export async function peekLink(tx: Queryable, token: string, now: Date): Promise<{ email: string; purpose: string } | null> {
  const [row] = await tx.query<RequestRow & { purpose: string }>(
    `select id, email, purpose, code_hash, attempts, expires_at, used_at from auth.sign_in_requests where link_hash = $1`,
    [sha256(token)],
  );
  return row && !checkUsable(row, now) ? { email: row.email, purpose: row.purpose } : null;
}

function checkUsable(row: RequestRow, now: Date): "used" | "expired" | null {
  if (row.used_at) return "used";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return null;
}

async function finish(tx: Queryable, row: RequestRow, now: Date): Promise<VerifyResult> {
  await tx.query(`update auth.sign_in_requests set used_at = $2 where id = $1`, [row.id, now]);
  const userId = await completeSignIn(tx, row.email, now);
  return { ok: true, userId, email: row.email };
}

/** Finds or creates the sign-in for this email and links it to the club's parent and staff records. */
export async function completeSignIn(tx: Queryable, email: string, now: Date): Promise<string> {
  const [{ id }] = await tx.query<{ id: string }>(
    `insert into auth.users (email, last_sign_in_at) values ($1, $2)
     on conflict ((lower(email))) do update set last_sign_in_at = excluded.last_sign_in_at
     returning id`,
    [email, now],
  );
  await linkRecords(tx, id, email);
  return id;
}

export async function linkRecords(tx: Queryable, userId: string, email: string): Promise<void> {
  await tx.query(`update guardians set auth_user_id = $1 where lower(email) = lower($2) and auth_user_id is null`, [userId, email]);
  await tx.query(`update staff set auth_user_id = $1 where lower(email) = lower($2) and auth_user_id is null`, [userId, email]);
}

// Sessions --------------------------------------------------------------------

export async function createSession(tx: Queryable, userId: string, now: Date): Promise<string> {
  const token = newToken();
  await tx.query(`insert into auth.sessions (id, user_id, created_at, expires_at, last_seen_at) values ($1, $2, $3, $4, $3)`, [
    sha256(token),
    userId,
    now,
    new Date(now.getTime() + SESSION_DAYS * 86400_000),
  ]);
  return token;
}

/** The signed-in user for a session cookie. Sliding expiry: each day of use pushes it out again. */
export async function readSession(tx: Queryable, token: string, now: Date): Promise<{ userId: string; email: string } | null> {
  const [row] = await tx.query<{ id: string; user_id: string; email: string; expires_at: Date; last_seen_at: Date }>(
    `select s.id, s.user_id, u.email, s.expires_at, s.last_seen_at
     from auth.sessions s join auth.users u on u.id = s.user_id where s.id = $1`,
    [sha256(token)],
  );
  if (!row || new Date(row.expires_at).getTime() <= now.getTime()) return null;
  if (now.getTime() - new Date(row.last_seen_at).getTime() > 86400_000) {
    await tx.query(`update auth.sessions set last_seen_at = $2, expires_at = $3 where id = $1`, [
      row.id,
      now,
      new Date(now.getTime() + SESSION_DAYS * 86400_000),
    ]);
  }
  return { userId: row.user_id, email: row.email };
}

export async function deleteSession(tx: Queryable, token: string): Promise<void> {
  await tx.query(`delete from auth.sessions where id = $1`, [sha256(token)]);
}
