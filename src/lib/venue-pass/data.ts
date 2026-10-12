import type { Queryable } from "../db/types";
import { iso } from "../db/types";

// A parent's own sports hub entry code (migration 0024): read as the parent (row level security: their own row only;
// staff never see it), written only through security-definer functions.

export type VenuePass = {
  /** The text inside the code, when the phone could read it from the screenshot. */
  text: string | null;
  /** Otherwise the screenshot itself (a club_files id) and its size in bytes. */
  imageId: string | null;
  imageBytes: number | null;
  updatedAt: string;
};

export async function loadMyVenuePass(tx: Queryable): Promise<VenuePass | null> {
  const [row] = await tx.query<{ code_text: string | null; image_file_id: string | null; size: number | null; updated_at: Date }>(
    `select v.code_text, v.image_file_id, f.size, v.updated_at
     from guardian_venue_passes v left join club_files f on f.id = v.image_file_id
     where v.guardian_id = my_guardian_id()`,
  );
  if (!row || (!row.code_text && !row.image_file_id)) return null;
  return { text: row.code_text, imageId: row.image_file_id, imageBytes: row.size, updatedAt: iso(row.updated_at) };
}

/** Saves the code's text (replacing a screenshot saved before, whose file is deleted). */
export async function setMyVenuePassText(tx: Queryable, text: string): Promise<void> {
  await tx.query(`select set_my_venue_pass($1)`, [text]);
}

/** Saves a screenshot the phone couldn't read (already re-encoded). Returns its file id. */
export async function setMyVenuePassImage(tx: Queryable, image: { mime: string; data: Uint8Array }): Promise<string> {
  const [{ id }] = await tx.query<{ id: string }>(`select set_my_venue_pass_image($1, $2::bytea) as id`, [image.mime, image.data]);
  return id;
}

export async function clearMyVenuePass(tx: Queryable): Promise<void> {
  await tx.query(`select clear_my_venue_pass()`);
}
