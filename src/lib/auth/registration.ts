import type { Queryable } from "../db/types";
import { isAgeGroup, type AgeGroup } from "../domain";
import { cleanPhone, cleanText } from "../validate";

// A family signing itself up. Checked here, held on the sign-in request until the email is proved,
// then turned into a guardian and children by applyRegistration.

export const MAX_CHILDREN = 6;

export type RegistrationChild = { firstName: string; lastName: string; dateOfBirth: string; ageGroup: AgeGroup };
export type Registration = { firstName: string; lastName: string; phone: string | null; children: RegistrationChild[] };

export type RegistrationCheck = { ok: true; registration: Registration } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRegistration(form: FormData, now = new Date()): RegistrationCheck {
  const firstName = cleanText(form.get("firstName"), 40);
  const lastName = cleanText(form.get("lastName"), 40);
  const phoneText = cleanText(form.get("phone"), 30);
  const phone = phoneText ? cleanPhone(phoneText) : null;
  if (!firstName || !lastName) return { ok: false, error: "Add your first and last name." };
  if (phoneText && !phone) return { ok: false, error: "Check your phone number, like 07700 900123." };

  const firsts = form.getAll("childFirstName");
  const lasts = form.getAll("childLastName");
  const dobs = form.getAll("childDob");
  const groups = form.getAll("childGroup");
  const children: RegistrationChild[] = [];
  for (let i = 0; i < Math.min(firsts.length, MAX_CHILDREN); i++) {
    const childFirst = cleanText(firsts[i], 40);
    const childLast = cleanText(lasts[i], 40) ?? lastName;
    const dob = typeof dobs[i] === "string" ? (dobs[i] as string) : "";
    const group = groups[i];
    if (!childFirst && !dob) continue; // an empty extra row
    const label = childFirst ?? `Child ${i + 1}`;
    if (!childFirst) return { ok: false, error: `Add child ${i + 1}'s first name.` };
    const born = ISO_DATE.test(dob) ? new Date(`${dob}T12:00:00Z`) : null;
    const age = born ? (now.getTime() - born.getTime()) / (365.25 * 86400_000) : NaN;
    if (!born || Number.isNaN(born.getTime()) || age < 3 || age > 17) return { ok: false, error: `Add ${label}'s date of birth.` };
    if (!isAgeGroup(group)) return { ok: false, error: `Choose ${label}'s group.` };
    children.push({ firstName: childFirst, lastName: childLast, dateOfBirth: dob, ageGroup: group });
  }
  if (children.length === 0) return { ok: false, error: "Add your child's details." };
  return { ok: true, registration: { firstName, lastName, phone, children } };
}

/** Reads a registration back from the sign-in request, trusting nothing about its shape. */
export function readRegistration(value: unknown): Registration | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<Registration>;
  if (typeof v.firstName !== "string" || typeof v.lastName !== "string" || !Array.isArray(v.children)) return null;
  const children = v.children.filter(
    (c): c is RegistrationChild =>
      !!c && typeof c.firstName === "string" && typeof c.lastName === "string" && ISO_DATE.test(String(c.dateOfBirth)) && isAgeGroup(c.ageGroup),
  );
  return children.length ? { firstName: v.firstName, lastName: v.lastName, phone: typeof v.phone === "string" ? v.phone : null, children } : null;
}

export type Registered = { guardianId: string; parentName: string; added: RegistrationChild[] };

/**
 * Creates the family for a proved email: the guardian (or the one the club already has), and each child
 * not already linked to them by name. Runs without row level security, inside the sign-in transaction.
 */
export async function applyRegistration(tx: Queryable, email: string, reg: Registration): Promise<Registered> {
  const [existing] = await tx.query<{ id: string; first_name: string; last_name: string }>(
    `select id, first_name, last_name from guardians where lower(email) = lower($1)`,
    [email],
  );
  const guardian =
    existing ??
    (
      await tx.query<{ id: string; first_name: string; last_name: string }>(
        `insert into guardians (first_name, last_name, email, phone, self_registered_at) values ($1, $2, $3, $4, now()) returning id, first_name, last_name`,
        [reg.firstName, reg.lastName, email, reg.phone],
      )
    )[0];
  if (existing && reg.phone) await tx.query(`update guardians set phone = coalesce(phone, $2) where id = $1`, [existing.id, reg.phone]);

  const linked = await tx.query<{ first_name: string; last_name: string }>(
    `select p.first_name, p.last_name from players p join player_guardians pg on pg.player_id = p.id where pg.guardian_id = $1`,
    [guardian.id],
  );
  const key = (f: string, l: string) => `${f.trim().toLowerCase()} ${l.trim().toLowerCase()}`;
  const have = new Set(linked.map((p) => key(p.first_name, p.last_name)));
  const added: RegistrationChild[] = [];
  for (const c of reg.children) {
    if (have.has(key(c.firstName, c.lastName))) continue;
    have.add(key(c.firstName, c.lastName));
    const [{ id }] = await tx.query<{ id: string }>(
      `insert into players (first_name, last_name, date_of_birth, age_group) values ($1, $2, $3::date, $4::age_group) returning id`,
      [c.firstName, c.lastName, c.dateOfBirth, c.ageGroup],
    );
    await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [id, guardian.id]);
    added.push(c);
  }
  return { guardianId: guardian.id, parentName: `${guardian.first_name} ${guardian.last_name}`, added };
}

/** Labels for the group picker, in the club's words. */
export const GROUP_LABELS: Record<AgeGroup, string> = {
  U6: "U6",
  U7: "U7",
  U10: "U10 (ages 8 to 10)",
  U12: "U12 (ages 11 and 12)",
  U15: "U15 (ages 13 to 15)",
  Girls: "Girls (all ages)",
};
