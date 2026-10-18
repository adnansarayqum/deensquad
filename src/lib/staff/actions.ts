"use server";

import { refresh } from "next/cache";
import { requireStaff } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { takeGatePayment, undoGatePayment, type Payer } from "../gate/payments";
import { markHere, undoHere } from "./checkin";

/** A tap's answer: nothing when it saved, or why it couldn't (shown beside the tap; see `TapProblem`). */
export type TapResult = { error?: string };
const RELOAD = { error: "That didn't save. Reload the page and try again." };

export async function checkInPlayer(sessionId: string, playerId: string): Promise<TapResult> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(playerId)) return RELOAD;
  // Refused (and nothing written) unless the session is today.
  const result = await asUser(user.id, (tx) => markHere(tx, sessionId, playerId, new Date()));
  refresh();
  return result;
}

export async function undoCheckIn(sessionId: string, playerId: string): Promise<TapResult> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(playerId)) return RELOAD;
  // Only on the session's day, like Mark here.
  const result = await asUser(user.id, (tx) => undoHere(tx, sessionId, playerId, new Date()));
  refresh();
  return result;
}


/** "Paid £7" on the register: the session fee taken at the gate for a child (or a trial, `kind: "trial"`). */
export async function recordGatePayment(sessionId: string, id: string, kind: "child" | "trial" = "child"): Promise<TapResult> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(id)) return RELOAD;
  const payer: Payer = kind === "trial" ? { trialId: id } : { playerId: id };
  const result = await asUser(user.id, (tx) => takeGatePayment(tx, sessionId, payer, user.staff.id, new Date()));
  refresh();
  return result;
}

export async function undoGatePaymentAction(sessionId: string, id: string, kind: "child" | "trial" = "child"): Promise<TapResult> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(id)) return RELOAD;
  const payer: Payer = kind === "trial" ? { trialId: id } : { playerId: id };
  const result = await asUser(user.id, (tx) => undoGatePayment(tx, sessionId, payer, new Date()));
  refresh();
  return result;
}
