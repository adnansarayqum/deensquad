"use server";

import { refresh } from "next/cache";
import { requireStaff } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { checkInByPass, type ScanResult } from "./checkin";

export async function checkInPlayer(sessionId: string, playerId: string): Promise<void> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(playerId)) return;
  await asUser(user.id, (tx) =>
    tx.query(
      `insert into attendance (session_id, player_id, method, recorded_by) values ($1, $2, 'manual', auth.uid()) on conflict do nothing`,
      [sessionId, playerId],
    ),
  );
  refresh();
}

export async function undoCheckIn(sessionId: string, playerId: string): Promise<void> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(playerId)) return;
  await asUser(user.id, (tx) => tx.query(`delete from attendance where session_id = $1 and player_id = $2`, [sessionId, playerId]));
  refresh();
}

/** The gate scanner: checks in a family from their pass and says who was checked in. */
export async function scanPass(token: string): Promise<ScanResult> {
  const user = await requireStaff();
  const result = await asUser(user.id, (tx) => checkInByPass(tx, token, new Date()));
  if (result.ok && result.children.some((c) => c.status === "checked_in")) refresh();
  return result;
}
