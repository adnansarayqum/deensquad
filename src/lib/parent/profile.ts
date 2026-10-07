import type { Queryable } from "../db/types";
import { isAgeGroup, type AgeGroup } from "../domain";
import { cleanText } from "../validate";

// Parents' own details and their children's, edited from the Player screen (/player/me, /player/child/[id],
// /player/add-child). Every write goes through a security-definer function from migration 0021, which checks the
// row is the caller's own and touches only these columns; the checks here give the parent a plain message first.

export const NAME_MAX = 60;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type MyDetails = { firstName: string; lastName: string; phone: string | null; email: string | null };
export type MyChild = { id: string; firstName: string; lastName: string; dateOfBirth: string | null; ageGroup: AgeGroup };

export async function loadMyDetails(tx: Queryable): Promise<MyDetails | null> {
  const [row] = await tx.query<{ first_name: string; last_name: string; phone: string | null; email: string | null }>(
    `select first_name, last_name, phone, email from guardians where id = my_guardian_id()`,
  );
  return row ? { firstName: row.first_name, lastName: row.last_name, phone: row.phone, email: row.email } : null;
}

/** One of the parent's own children, with their date of birth (which the family's `Child` doesn't carry). Null for anyone else's. */
export async function loadMyChild(tx: Queryable, id: string): Promise<MyChild | null> {
  const [row] = await tx.query<{ id: string; first_name: string; last_name: string; date_of_birth: string | null; age_group: AgeGroup }>(
    `select id, first_name, last_name, date_of_birth::text as date_of_birth, age_group::text as age_group
     from players where id = $1 and id in (select my_player_ids())`,
    [id],
  );
  return row ? { id: row.id, firstName: row.first_name, lastName: row.last_name, dateOfBirth: row.date_of_birth, ageGroup: row.age_group } : null;
}

/** A name a parent typed, or null: whitespace tidied, at most NAME_MAX characters. */
export const cleanName = (value: unknown) => cleanText(value, NAME_MAX);

export type DobCheck = { ok: true; dob: string } | { ok: false; error: string };

/**
 * A child's date of birth from a date input: a real day, not in the future, and an age of 3 to 18 (the club's
 * youngest group is U6; anyone older has left). The message names the child.
 */
export function checkDateOfBirth(value: unknown, childName: string, now = new Date()): DobCheck {
  const text = typeof value === "string" ? value.trim() : "";
  const born = ISO_DATE.test(text) ? new Date(`${text}T12:00:00Z`) : null;
  if (!born || Number.isNaN(born.getTime()) || born.toISOString().slice(0, 10) !== text) {
    return { ok: false, error: `Add ${childName}'s date of birth.` };
  }
  if (born.getTime() > now.getTime()) return { ok: false, error: `${childName}'s date of birth can't be in the future.` };
  const age = (now.getTime() - born.getTime()) / (365.25 * 86400_000);
  if (age < 3 || age >= 19) return { ok: false, error: `Check ${childName}'s date of birth: it makes them ${Math.floor(age)}.` };
  return { ok: true, dob: text };
}

export async function updateMyDetails(tx: Queryable, details: { firstName: string; lastName: string; phone: string | null }): Promise<void> {
  await tx.query(`select update_my_details($1, $2, $3)`, [details.firstName, details.lastName, details.phone]);
}

export async function updateMyChild(tx: Queryable, child: { id: string; firstName: string; lastName: string; dateOfBirth: string }): Promise<void> {
  await tx.query(`select update_my_child($1, $2, $3, $4::date)`, [child.id, child.firstName, child.lastName, child.dateOfBirth]);
}

/** True when a child with this first name (any case) and date of birth is already on the parent's account. */
export async function haveChild(tx: Queryable, firstName: string, dateOfBirth: string): Promise<boolean> {
  const rows = await tx.query(
    `select 1 from players where id in (select my_player_ids()) and lower(first_name) = lower($1) and date_of_birth = $2::date`,
    [firstName, dateOfBirth],
  );
  return rows.length > 0;
}

export async function addMyChild(tx: Queryable, child: { firstName: string; lastName: string; dateOfBirth: string; ageGroup: AgeGroup }): Promise<string> {
  if (!isAgeGroup(child.ageGroup)) throw new Error("invalid group");
  const [{ id }] = await tx.query<{ id: string }>(`select add_my_child($1, $2, $3::date, $4) as id`, [
    child.firstName,
    child.lastName,
    child.dateOfBirth,
    child.ageGroup,
  ]);
  return id;
}
