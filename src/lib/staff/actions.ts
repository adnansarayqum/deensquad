"use server";

import { refresh } from "next/cache";
import { requireStaff } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { takeGatePayment, undoGatePayment, type Payer } from "../gate/payments";

/** A tap's answer: nothing when it saved, or why it couldn't (shown beside the tap; see `TapProblem`). */
export type TapResult = { error?: string };
const RELOAD = { error: "That didn't save. Reload the page and try again." };

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
