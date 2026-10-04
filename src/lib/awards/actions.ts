"use server";

import { refresh } from "next/cache";
import { requireStaff, staffGroups } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import type { Queryable } from "../db/types";
import { cleanText } from "../validate";

export type AwardState = { error?: string; saved?: boolean };

/** Coaches can only award children in their own groups; admins anyone. */
async function canAward(tx: Queryable, playerId: string, groups: string[]): Promise<boolean> {
  const rows = await tx.query(`select 1 from players where id = $1 and age_group::text = any ($2::text[])`, [playerId, groups]);
  return rows.length > 0;
}

export async function giveAward(_prev: AwardState, formData: FormData): Promise<AwardState> {
  const user = await requireStaff();
  const player = formData.get("player");
  const star = formData.get("star") === "on";
  const points = Math.trunc(Number(formData.get("points") ?? 0)) || 0;
  const reason = cleanText(formData.get("reason"), 200);
  if (typeof player !== "string" || !UUID.test(player)) return { error: "Something went wrong. Reload and try again." };
  if (points < 0 || points > 50) return { error: "Give between 1 and 50 points." };
  if (!star && points === 0) return { error: "Choose points or a star." };
  const error = await asUser(user.id, async (tx) => {
    if (!(await canAward(tx, player, staffGroups(user.staff)))) return "You can give points and stars to your own groups only.";
    await tx.query(`insert into player_awards (player_id, stars, points, reason, awarded_by) values ($1, $2, $3, $4, $5)`, [
      player,
      star ? 1 : 0,
      points,
      reason,
      user.staff.id,
    ]);
    return null;
  });
  if (error) return { error };
  refresh();
  return { saved: true };
}

export async function removeAward(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = formData.get("award");
  if (typeof id !== "string" || !UUID.test(id)) return;
  // Admins can take back any award; coaches only their own.
  await asUser(user.id, (tx) =>
    tx.query(`delete from player_awards where id = $1 and ($2 or awarded_by = $3)`, [id, user.staff.role === "admin", user.staff.id]),
  );
  refresh();
}

export async function writeCoachNote(_prev: AwardState, formData: FormData): Promise<AwardState> {
  const user = await requireStaff();
  const player = formData.get("player");
  const body = cleanText(formData.get("note"), 500);
  if (typeof player !== "string" || !UUID.test(player)) return { error: "Something went wrong. Reload and try again." };
  if (!body) return { error: "Write the note first." };
  const error = await asUser(user.id, async (tx) => {
    if (!(await canAward(tx, player, staffGroups(user.staff)))) return "You can write notes for your own groups only.";
    await tx.query(`insert into coach_notes (player_id, author, body) values ($1, $2, $3)`, [player, user.staff.id, body]);
    return null;
  });
  if (error) return { error };
  refresh();
  return { saved: true };
}
