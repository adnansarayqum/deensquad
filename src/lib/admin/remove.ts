import type { Queryable } from "../db/types";

// Taking a child or a parent off the club's list. A parent left with no children at the club is
// deleted, and so is their sign-in (see deleteLeftoverAccounts), as the privacy notice promises.

/** What was removed: the deleted parents' sign-ins and email addresses, for deleteLeftoverAccounts. */
export type Removed = { userIds: string[]; emails: string[] };

async function deleteChildlessGuardians(tx: Queryable, guardianIds: string[]): Promise<Removed> {
  if (guardianIds.length === 0) return { userIds: [], emails: [] };
  const rows = await tx.query<{ auth_user_id: string | null; email: string | null }>(
    `delete from guardians g where g.id = any($1::uuid[]) and not exists (select 1 from player_guardians where guardian_id = g.id)
     returning auth_user_id, email`,
    [guardianIds],
  );
  return {
    userIds: rows.flatMap((r) => (r.auth_user_id ? [r.auth_user_id] : [])),
    emails: rows.flatMap((r) => (r.email ? [r.email.toLowerCase()] : [])),
  };
}

/** Deletes a child. Parents with no other children at the club go too. Run as the admin (row level security applies). */
export async function removeChildRecord(tx: Queryable, child: string): Promise<Removed> {
  const guardians = await tx.query<{ guardian_id: string }>(`select guardian_id from player_guardians where player_id = $1`, [child]);
  await tx.query(`delete from players where id = $1`, [child]);
  return deleteChildlessGuardians(
    tx,
    guardians.map((g) => g.guardian_id),
  );
}

/** Takes a parent off a child. A parent left with no children at the club is deleted. Run as the admin. */
export async function unlinkGuardianRecord(tx: Queryable, child: string, guardian: string): Promise<Removed> {
  await tx.query(`delete from player_guardians where player_id = $1 and guardian_id = $2`, [child, guardian]);
  return deleteChildlessGuardians(tx, [guardian]);
}

/**
 * Deletes the sign-ins of parents who were just removed, unless the sign-in still belongs to another parent
 * record or to a member of staff. Their devices and push subscriptions go with them (on delete cascade),
 * as do their sign-in codes and links. Needs the system connection: auth.* is outside row level security.
 */
export async function deleteLeftoverAccounts(tx: Queryable, removed: Removed): Promise<number> {
  if (removed.userIds.length === 0 && removed.emails.length === 0) return 0;
  const users = await tx.query<{ email: string }>(
    `delete from auth.users u
     where u.id = any($1::uuid[])
       and not exists (select 1 from guardians g where g.auth_user_id = u.id or lower(g.email) = lower(u.email))
       and not exists (select 1 from staff s where s.auth_user_id = u.id or lower(s.email) = lower(u.email))
     returning lower(email) as email`,
    [removed.userIds],
  );
  const emails = [...new Set([...users.map((u) => u.email), ...removed.emails])];
  await tx.query(
    `delete from auth.sign_in_requests r
     where lower(r.email) = any($1::text[])
       and not exists (select 1 from guardians g where lower(g.email) = lower(r.email))
       and not exists (select 1 from staff s where lower(s.email) = lower(r.email))`,
    [emails],
  );
  return users.length;
}
