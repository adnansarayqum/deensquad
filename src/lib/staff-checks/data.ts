import type { Queryable } from "../db/types";
import { addDaysIso, DUE_SOON_DAYS, REQUIRED_KINDS, type CheckKind, type StaffCheck } from "./checks";

// Staff checks (migration 0035): reading and writing. Admins only for writes (RLS `is_admin()`), so the actions run
// as the admin with `asUser`; the hourly reminder reads as the system.

type Row = { id: string; staff_id: string; kind: CheckKind; title: string | null; reference: string | null; issued_on: string | null; expires_on: string | null };
const toCheck = (r: Row): StaffCheck => ({ id: r.id, staffId: r.staff_id, kind: r.kind, title: r.title, reference: r.reference, issuedOn: r.issued_on, expiresOn: r.expires_on });
const COLUMNS = `id, staff_id, kind, title, reference, issued_on::text as issued_on, expires_on::text as expires_on`;

export async function loadAllStaffChecks(tx: Queryable): Promise<StaffCheck[]> {
  return (await tx.query<Row>(`select ${COLUMNS} from staff_checks order by kind, expires_on nulls last`)).map(toCheck);
}

export async function loadStaffChecksFor(tx: Queryable, staffId: string): Promise<StaffCheck[]> {
  return (await tx.query<Row>(`select ${COLUMNS} from staff_checks where staff_id = $1 order by kind, expires_on nulls last`, [staffId])).map(toCheck);
}

export type CheckInput = { kind: CheckKind; title: string | null; reference: string | null; issuedOn: string | null; expiresOn: string | null };

/** Adds a check, or changes one (by id, for that member of staff). A new expiry date means a new reminder. */
export async function saveStaffCheck(tx: Queryable, staffId: string, input: CheckInput, by: string, id: string | null): Promise<void> {
  if (id) {
    await tx.query(
      `update staff_checks set kind = $3, title = $4, reference = $5, issued_on = $6::date, expires_on = $7::date, updated_by = $8, updated_at = now(),
         reminded_at = case when expires_on is distinct from $7::date then null else reminded_at end
       where id = $1 and staff_id = $2`,
      [id, staffId, input.kind, input.title, input.reference, input.issuedOn, input.expiresOn, by],
    );
  } else {
    await tx.query(
      `insert into staff_checks (staff_id, kind, title, reference, issued_on, expires_on, updated_by) values ($1, $2, $3, $4, $5::date, $6::date, $7)`,
      [staffId, input.kind, input.title, input.reference, input.issuedOn, input.expiresOn, by],
    );
  }
}

export async function deleteStaffCheck(tx: Queryable, staffId: string, id: string): Promise<void> {
  await tx.query(`delete from staff_checks where id = $1 and staff_id = $2`, [id, staffId]);
}

/**
 * How many members of staff need something done: a required check missing or run out, or any check running out within
 * DUE_SOON_DAYS. The overview's Needs you row; it equals the people marked on the Staff page.
 */
export async function countStaffNeedingChecks(tx: Queryable, today: string): Promise<number> {
  const [row] = await tx.query<{ n: number }>(
    `select count(*)::int as n from staff s
     where exists (select 1 from staff_checks c where c.staff_id = s.id and c.expires_on is not null and c.expires_on <= $2::date)
        or exists (select 1 from unnest($3::text[]) k
                   where not exists (select 1 from staff_checks c where c.staff_id = s.id and c.kind = k and (c.expires_on is null or c.expires_on >= $1::date)))`,
    [today, addDaysIso(today, DUE_SOON_DAYS), REQUIRED_KINDS],
  );
  return row.n;
}

export type DueReminder = { id: string; staffName: string; staffEmail: string; kind: CheckKind; title: string | null; expiresOn: string };

/** Checks running out within DUE_SOON_DAYS (or already run out) that haven't had their email. */
export async function dueCheckReminders(tx: Queryable, today: string): Promise<DueReminder[]> {
  const rows = await tx.query<{ id: string; staff_name: string; staff_email: string; kind: CheckKind; title: string | null; expires_on: string }>(
    `select c.id, s.display_name as staff_name, s.email as staff_email, c.kind, c.title, c.expires_on::text as expires_on
     from staff_checks c join staff s on s.id = c.staff_id
     where c.reminded_at is null and c.expires_on is not null and c.expires_on <= $1::date
     order by c.expires_on`,
    [addDaysIso(today, DUE_SOON_DAYS)],
  );
  return rows.map((r) => ({ id: r.id, staffName: r.staff_name, staffEmail: r.staff_email, kind: r.kind, title: r.title, expiresOn: r.expires_on }));
}

export async function markCheckReminded(tx: Queryable, ids: string[], now: Date): Promise<void> {
  if (ids.length) await tx.query(`update staff_checks set reminded_at = $2 where id = any($1::uuid[])`, [ids, now]);
}
