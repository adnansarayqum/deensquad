import { normaliseEmail } from "../auth/tokens";
import type { Queryable } from "../db/types";
import { AGE_GROUPS, type AgeGroup } from "../domain";
import { cleanPhone, cleanText } from "../validate";
import { parseCsv } from "./csv";

// Families import: one row per child. Rows that share a parent email become one family, and a
// second-parent column links both parents to the same children. Importing the same sheet again
// updates the children it finds (same parent email, same child name) instead of duplicating them.

export type ParentInput = { firstName: string; lastName: string; email: string; phone: string | null };

export type ImportRow = {
  line: number;
  child: { firstName: string; lastName: string; dateOfBirth: string | null; ageGroup: AgeGroup; shirtNumber: number | null; position: string | null };
  parents: ParentInput[];
};

export type ImportProblem = { line: number; message: string };

export type ImportPlan = { rows: ImportRow[]; errors: ImportProblem[]; warnings: ImportProblem[]; columns: string[] };

// Column names we recognise, after lower-casing and turning punctuation into spaces.
const COLUMNS: Record<string, string[]> = {
  childFirst: ["child first name", "player first name", "first name", "forename", "child forename", "player forename", "childs first name"],
  childLast: ["child last name", "player last name", "last name", "surname", "child surname", "player surname", "family name", "childs last name"],
  childName: ["child name", "player name", "child", "player", "name", "childs name", "child full name", "player full name"],
  dob: ["date of birth", "dob", "birth date", "birthday", "child dob", "player dob", "child date of birth", "player date of birth"],
  ageGroup: ["age group", "group", "team", "squad", "age"],
  shirt: ["shirt number", "shirt", "number", "squad number", "kit number", "shirt no"],
  position: ["position", "playing position"],
  p1First: ["parent first name", "guardian first name", "parent forename", "parent 1 first name", "parent1 first name"],
  p1Last: ["parent last name", "guardian last name", "parent surname", "parent 1 last name", "parent1 last name", "parent 1 surname"],
  p1Name: ["parent name", "guardian name", "parent", "guardian", "parent 1 name", "parent1 name", "parent 1", "contact name", "parent full name"],
  p1Email: ["parent email", "email", "guardian email", "email address", "parent 1 email", "parent1 email", "contact email", "parent email address"],
  p1Phone: ["parent phone", "phone", "mobile", "guardian phone", "phone number", "mobile number", "parent 1 phone", "parent1 phone", "contact number", "parent mobile"],
  p2First: ["parent 2 first name", "parent2 first name", "second parent first name", "guardian 2 first name"],
  p2Last: ["parent 2 last name", "parent2 last name", "second parent last name", "parent 2 surname", "guardian 2 last name"],
  p2Name: ["parent 2 name", "parent2 name", "second parent name", "parent 2", "guardian 2 name", "guardian 2"],
  p2Email: ["parent 2 email", "parent2 email", "second parent email", "second email", "guardian 2 email"],
  p2Phone: ["parent 2 phone", "parent2 phone", "second parent phone", "second phone", "parent 2 mobile", "guardian 2 phone"],
};

const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function splitName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  const parts = full.split(" ");
  return { first: parts[0] ?? null, last: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

export function parseAgeGroup(value: string | null): AgeGroup | null {
  if (!value) return null;
  const m = value.match(/(?:u|under)\s*-?\s*(\d{1,2})/i) ?? value.match(/^\s*(\d{1,2})\s*s?\s*$/i);
  if (!m) return null;
  // "U9" or "9s" means the group that covers that age: U10 takes 8, 9 and 10 year olds.
  const age = Number(m[1]);
  return AGE_GROUPS.find((g) => Number(g.slice(1)) >= age && age >= 4) ?? null;
}

/** DD/MM/YYYY (UK order), D/M/YYYY, DD-MM-YYYY, DD.MM.YYYY or YYYY-MM-DD → "YYYY-MM-DD". */
export function parseDate(value: string | null, now = new Date()): string | null {
  if (!value) return null;
  let y: number, m: number, d: number;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const uk = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (uk) {
    [d, m, y] = [Number(uk[1]), Number(uk[2]), Number(uk[3])];
    if (y < 100) y += 2000;
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < now.getUTCFullYear() - 25 || date.getTime() > now.getTime()) return null;
  return date.toISOString().slice(0, 10);
}

export function planImport(csvText: string, now = new Date()): ImportPlan {
  const table = parseCsv(csvText);
  const errors: ImportProblem[] = [];
  const warnings: ImportProblem[] = [];
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: "The file needs a header row and at least one child." }], warnings, columns: [] };

  const header = table[0].map(headerKey);
  const col = (key: keyof typeof COLUMNS) => header.findIndex((h) => COLUMNS[key].includes(h));
  const at = Object.fromEntries(Object.keys(COLUMNS).map((k) => [k, col(k as keyof typeof COLUMNS)])) as Record<keyof typeof COLUMNS, number>;
  const recognised = Object.entries(at)
    .filter(([, i]) => i >= 0)
    .map(([, i]) => table[0][i].trim());

  const missing: string[] = [];
  if (at.childFirst < 0 && at.childName < 0) missing.push("child's first name (or child name)");
  if (at.ageGroup < 0) missing.push("age group");
  if (at.p1Email < 0) missing.push("parent email");
  if (missing.length) {
    return { rows: [], errors: [{ line: 1, message: `Couldn't find these columns: ${missing.join(", ")}. Use the template's column names.` }], warnings, columns: recognised };
  }

  const rows: ImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const cell = (i: number, max = 80) => (i >= 0 ? cleanText(table[r][i] ?? "", max) : null);
    const problems: string[] = [];

    const childName = splitName(cell(at.childName));
    const firstName = cell(at.childFirst) ?? childName.first;
    const lastName = cell(at.childLast) ?? childName.last;
    if (!firstName) problems.push("the child's first name is missing");
    if (!lastName) problems.push("the child's last name is missing");

    const groupText = cell(at.ageGroup, 20);
    const ageGroup = parseAgeGroup(groupText);
    if (!ageGroup) problems.push(groupText ? `"${groupText}" isn't one of the app's age groups (${AGE_GROUPS.join(", ")})` : "the age group is missing");

    const dobText = cell(at.dob, 20);
    const dateOfBirth = parseDate(dobText, now);
    if (dobText && !dateOfBirth) problems.push(`"${dobText}" isn't a date of birth we can read (use DD/MM/YYYY)`);

    const shirtText = cell(at.shirt, 5);
    const shirtNumber = shirtText && /^\d{1,2}$/.test(shirtText) && Number(shirtText) >= 1 ? Number(shirtText) : null;
    if (shirtText && shirtNumber === null) warnings.push({ line, message: `Shirt number "${shirtText}" was left out (use 1 to 99).` });

    const parents: ParentInput[] = [];
    const parent = (first: number, last: number, name: number, emailCol: number, phoneCol: number, label: string, required: boolean) => {
      const emailText = cell(emailCol, 254);
      const email = normaliseEmail(emailText);
      const full = splitName(cell(name));
      const pFirst = cell(first) ?? full.first;
      const pLast = cell(last) ?? full.last ?? lastName;
      const phoneText = cell(phoneCol, 30);
      const phone = cleanPhone(phoneText);
      if (!emailText && !pFirst && !phoneText) {
        if (required) problems.push(`${label}'s email is missing`);
        return;
      }
      if (!email) {
        if (required) problems.push(emailText ? `"${emailText}" isn't an email address` : `${label}'s email is missing`);
        else warnings.push({ line, message: `${label} was left out: they need an email address to sign in.` });
        return;
      }
      if (!pFirst) {
        problems.push(`${label}'s name is missing`);
        return;
      }
      if (phoneText && !phone) warnings.push({ line, message: `${label}'s phone "${phoneText}" was left out (use a UK mobile like 07700 900123).` });
      parents.push({ firstName: pFirst, lastName: pLast ?? "", email, phone });
    };
    parent(at.p1First, at.p1Last, at.p1Name, at.p1Email, at.p1Phone, "The parent", true);
    parent(at.p2First, at.p2Last, at.p2Name, at.p2Email, at.p2Phone, "The second parent", false);
    if (parents.length === 2 && parents[0].email === parents[1].email) parents.pop();

    if (problems.length) {
      errors.push({ line, message: problems.join("; ").replace(/^./, (c) => c.toUpperCase()) + "." });
      continue;
    }
    rows.push({
      line,
      child: { firstName: firstName!, lastName: lastName!, dateOfBirth, ageGroup: ageGroup!, shirtNumber, position: cell(at.position, 40) },
      parents,
    });
  }
  return { rows, errors, warnings, columns: recognised };
}

export type ImportSummary = { childrenAdded: number; childrenUpdated: number; parentsAdded: number; parentsUpdated: number; families: number };

/** Writes the plan. Runs as an admin, so row level security still applies. */
export async function applyImport(tx: Queryable, plan: ImportPlan): Promise<ImportSummary> {
  const summary: ImportSummary = { childrenAdded: 0, childrenUpdated: 0, parentsAdded: 0, parentsUpdated: 0, families: 0 };
  const seenParents = new Map<string, string>();
  const families = new Set<string>();

  for (const row of plan.rows) {
    const guardianIds: string[] = [];
    for (const p of row.parents) {
      let id = seenParents.get(p.email);
      if (!id) {
        const [g] = await tx.query<{ id: string; inserted: boolean }>(
          `insert into guardians (first_name, last_name, email, phone) values ($1, $2, $3, $4)
           on conflict ((lower(email))) where email is not null do update
             set first_name = excluded.first_name, last_name = excluded.last_name, phone = coalesce(excluded.phone, guardians.phone)
           returning id, (xmax = 0) as inserted`,
          [p.firstName, p.lastName, p.email, p.phone],
        );
        id = g.id;
        seenParents.set(p.email, id);
        if (g.inserted) summary.parentsAdded++;
        else summary.parentsUpdated++;
      }
      guardianIds.push(id);
    }
    families.add([...guardianIds].sort()[0]);

    const c = row.child;
    const [existing] = await tx.query<{ id: string }>(
      `select p.id from players p join player_guardians pg on pg.player_id = p.id
       where pg.guardian_id = any($1::uuid[]) and lower(p.first_name) = lower($2) and lower(p.last_name) = lower($3) limit 1`,
      [guardianIds, c.firstName, c.lastName],
    );
    let playerId: string;
    if (existing) {
      playerId = existing.id;
      await tx.query(
        `update players set age_group = $2::age_group, date_of_birth = coalesce($3::date, date_of_birth),
           shirt_number = coalesce($4, shirt_number), position = coalesce($5, position) where id = $1`,
        [playerId, c.ageGroup, c.dateOfBirth, c.shirtNumber, c.position],
      );
      summary.childrenUpdated++;
    } else {
      const [p] = await tx.query<{ id: string }>(
        `insert into players (first_name, last_name, date_of_birth, age_group, shirt_number, position)
         values ($1, $2, $3::date, $4::age_group, $5, $6) returning id`,
        [c.firstName, c.lastName, c.dateOfBirth, c.ageGroup, c.shirtNumber, c.position],
      );
      playerId = p.id;
      summary.childrenAdded++;
    }
    for (const gid of guardianIds) {
      await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2) on conflict do nothing`, [playerId, gid]);
    }
  }
  summary.families = families.size;
  return summary;
}

export const TEMPLATE_HEADER = [
  "Child first name",
  "Child last name",
  "Date of birth",
  "Age group",
  "Shirt number",
  "Position",
  "Parent first name",
  "Parent last name",
  "Parent email",
  "Parent phone",
  "Parent 2 first name",
  "Parent 2 last name",
  "Parent 2 email",
  "Parent 2 phone",
];
