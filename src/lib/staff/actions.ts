"use server";

import { refresh } from "next/cache";
import { requireStaff } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { checkInByPass, markHere, type ScanResult } from "./checkin";

/** A tap's answer: nothing when it saved, or why it couldn't (shown beside the tap; see `TapProblem`). */
export type TapResult = { error?: string };
const RELOAD = { error: "That didn't save. Reload the page and try again." };

export async function checkInPlayer(sessionId: string, playerId: string): Promise<TapResult> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(playerId)) return RELOAD;
  // Refused (and nothing written) unless the session is today; existing check-ins are left as they are.
  const result = await asUser(user.id, (tx) => markHere(tx, sessionId, playerId, new Date()));
  refresh();
  return result;
}

export async function undoCheckIn(sessionId: string, playerId: string): Promise<TapResult> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(playerId)) return RELOAD;
  await asUser(user.id, (tx) => tx.query(`delete from attendance where session_id = $1 and player_id = $2`, [sessionId, playerId]));
  refresh();
  return {};
}

/** The gate scanner: checks a child in from their pass and says what happened. */
export async function scanPass(token: string): Promise<ScanResult> {
  const user = await requireStaff();
  const result = await asUser(user.id, (tx) => checkInByPass(tx, token, new Date()));
  if (result.ok && result.child.status === "checked_in") refresh();
  return result;
}
