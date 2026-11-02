"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { requireAdmin, requireStaff, staffGroups } from "../auth/session";
import { enqueue } from "../background";
import { NO_AWARDS_GROUPS } from "../domain";
import { markRewarded } from "./milestones";
import { runPointsMilestones } from "./milestones-run";
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

/** Points, stars and badges: never for the groups without them (U15, the owner's decision). */
async function canGivePoints(tx: Queryable, playerId: string, groups: string[]): Promise<boolean> {
  const rows = await tx.query(`select 1 from players where id = $1 and age_group::text = any ($2::text[]) and age_group::text <> all ($3::text[])`, [
    playerId,
    groups,
    [...NO_AWARDS_GROUPS],
  ]);
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
    if (!(await canGivePoints(tx, player, staffGroups(user.staff)))) return "The U15s don't have points or stars.";
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
  // 20 points: the admins and the parents are told (the reward is the owner's), after the response has gone.
  if (points > 0) after(() => enqueue("points reward", () => runPointsMilestones().then(() => undefined)));
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

/**
 * Gives (or takes back) one of the club's badges. Coaches for their own groups, and only the badges coaches give;
 * the register's badges (10 sessions, On time ×5) are the admins'. Never a retired badge, never for U15.
 */
export async function setBadge(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const player = formData.get("player");
  const badge = formData.get("badge");
  const give = formData.get("give") === "yes";
  if (typeof player !== "string" || !UUID.test(player) || typeof badge !== "string" || !/^[a-z0-9-]{1,40}$/.test(badge)) return;
  await asUser(user.id, async (tx) => {
    if (!(await canGivePoints(tx, player, staffGroups(user.staff)))) return;
    const [b] = await tx.query<{ given_by: string; retired: boolean }>(`select given_by, retired from badges where id = $1`, [badge]);
    if (!b || (give && b.retired) || (b.given_by === "admin" && user.staff.role !== "admin")) return;
    if (give) await tx.query(`insert into player_badges (player_id, badge_id) values ($1, $2) on conflict do nothing`, [player, badge]);
    else await tx.query(`delete from player_badges where player_id = $1 and badge_id = $2`, [player, badge]);
  });
  refresh();
}

/** Admin → Rewards: "Reward given" (or Undo) for a child who reached the reward points. */
export async function setRewardGiven(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const player = formData.get("player");
  if (typeof player !== "string" || !UUID.test(player)) return;
  await asUser(user.id, (tx) => markRewarded(tx, player, user.staff.id, formData.get("given") !== "no"));
  refresh();
}
