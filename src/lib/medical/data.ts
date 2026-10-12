import type { Queryable } from "../db/types";
import { iso } from "../db/types";

// A child's medical and additional needs (migration 0024): special-category health data, so kept apart and narrow.
// Written only by the child's own parents, with their consent (`set_my_child_medical`); read by those parents, the
// club's admins and the coaches of the child's group (`can_see_medical`, also enforced by row level security).
// Never in spreadsheets, AI prompts, news, emails or logs: nothing here logs a field, and no other module selects
// from player_medical except the parent's own data download.

export const MEDICAL_FIELD_MAX = 500;

export const MEDICAL_FIELDS = ["conditions", "allergies", "medication", "howToHelp"] as const;
export type MedicalField = (typeof MEDICAL_FIELDS)[number];
export type MedicalText = Record<MedicalField, string | null>;
export type Medical = MedicalText & { consentAt: string; updatedAt: string };

/** The labels parents and staff see, in order. */
export const MEDICAL_LABELS: Record<MedicalField, string> = {
  conditions: "Conditions or needs",
  allergies: "Allergies",
  medication: "Medication",
  howToHelp: "How the coaches can help",
};

type Row = { conditions: string | null; allergies: string | null; medication: string | null; how_to_help: string | null; consent_at: Date; updated_at: Date };
const COLUMNS = `conditions, allergies, medication, how_to_help, consent_at, updated_at`;
const toMedical = (r: Row): Medical => ({
  conditions: r.conditions,
  allergies: r.allergies,
  medication: r.medication,
  howToHelp: r.how_to_help,
  consentAt: iso(r.consent_at),
  updatedAt: iso(r.updated_at),
});

/** A field as a parent typed it: line breaks kept, ends trimmed; null when empty. Over the limit is the caller's error. */
export function cleanMedicalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text || null;
}

/** One of the parent's own children's medical information (null when none, or not their child). */
export async function loadMyChildMedical(tx: Queryable, childId: string): Promise<Medical | null> {
  const [row] = await tx.query<Row>(`select ${COLUMNS} from player_medical where player_id = $1 and player_id in (select my_player_ids())`, [childId]);
  return row ? toMedical(row) : null;
}

/** For staff: a child's medical information, only when this member of staff may see it (admin, or the child's group's coach). */
export async function loadMedicalForStaff(tx: Queryable, childId: string): Promise<Medical | null> {
  const [row] = await tx.query<Row>(`select ${COLUMNS} from player_medical where player_id = $1 and can_see_medical(player_id)`, [childId]);
  return row ? toMedical(row) : null;
}

/** Which of these children have the parent's own medical information (for the To-do list). */
export async function myChildrenWithMedical(tx: Queryable, childIds: string[]): Promise<Set<string>> {
  if (childIds.length === 0) return new Set();
  const rows = await tx.query<{ player_id: string }>(
    `select player_id from player_medical where player_id = any($1::uuid[]) and player_id in (select my_player_ids())`,
    [childIds],
  );
  return new Set(rows.map((r) => r.player_id));
}

/**
 * SQL for staff screens (register, scanner): true when child `p` has medical information this member of staff may
 * see. Coaches of other groups get false, so they don't even see that there is some.
 */
export const medicalMarkerSql = (p: string) => `exists (select 1 from player_medical m where m.player_id = ${p}.id and can_see_medical(m.player_id))`;

/** Saves (or, with every field blank, removes) the parent's own child's information; the database checks consent. */
export async function setMyChildMedical(tx: Queryable, childId: string, text: MedicalText, consent: boolean): Promise<void> {
  await tx.query(`select set_my_child_medical($1, $2, $3, $4, $5, $6)`, [childId, text.conditions, text.allergies, text.medication, text.howToHelp, consent]);
}

export async function clearMyChildMedical(tx: Queryable, childId: string): Promise<void> {
  await tx.query(`select clear_my_child_medical($1)`, [childId]);
}
