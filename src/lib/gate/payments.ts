import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { sessionFeePence } from "../settings";
import { registerRefusal } from "../staff/checkin";

// The session fee taken at the gate (migration 0032 `session_payments`): pay-as-you-go families and children with no
// payment plan pay for each session (£7 by card on the club's machine, the owner's figure; `sessionFeePence`), and so
// do trial children (src/lib/trials). A coach taps "Paid £7" on the register or the scanner's card; it's recorded
// against the session at the fee that day, once per child (or trial). Only on the session's own day, like Mark here,
// so the record matches the register. Runs as the member of staff (row level security: staff only).

export { paysAtGate } from "../staff/flags";

export type Payer = { playerId: string } | { trialId: string };

export async function takeGatePayment(tx: Queryable, sessionId: string, payer: Payer, staffId: string, now: Date): Promise<{ error?: string }> {
  const refused = await registerRefusal(tx, sessionId, now);
  if (refused) return { error: refused };
  const fee = await sessionFeePence(tx);
  if ("playerId" in payer) {
    await tx.query(
      `insert into session_payments (session_id, player_id, amount_pence, method, taken_by) values ($1, $2, $3, 'card', $4)
       on conflict (session_id, player_id) where player_id is not null do nothing`,
      [sessionId, payer.playerId, fee, staffId],
    );
  } else {
    const [trial] = await tx.query<{ id: string }>(`select id from trial_bookings where id = $1 and session_id = $2 and cancelled_at is null`, [payer.trialId, sessionId]);
    if (!trial) return { error: "That trial isn't on this register any more. Reload the page." };
    await tx.query(
      `insert into session_payments (session_id, trial_id, amount_pence, method, taken_by) values ($1, $2, $3, 'card', $4)
       on conflict (session_id, trial_id) where trial_id is not null do nothing`,
      [sessionId, payer.trialId, fee, staffId],
    );
  }
  return {};
}

/** Undo a payment tapped by mistake: the same day lock. */
export async function undoGatePayment(tx: Queryable, sessionId: string, payer: Payer, now: Date): Promise<{ error?: string }> {
  const refused = await registerRefusal(tx, sessionId, now);
  if (refused) return { error: refused };
  if ("playerId" in payer) await tx.query(`delete from session_payments where session_id = $1 and player_id = $2`, [sessionId, payer.playerId]);
  else await tx.query(`delete from session_payments where session_id = $1 and trial_id = $2`, [sessionId, payer.trialId]);
  return {};
}

export type GatePaid = { amountPence: number; at: string };

/** What's been taken for a session: per child, per trial, and the total. */
export async function loadSessionPayments(tx: Queryable, sessionId: string) {
  const rows = await tx.query<{ player_id: string | null; trial_id: string | null; amount_pence: number; taken_at: Date }>(
    `select player_id, trial_id, amount_pence, taken_at from session_payments where session_id = $1`,
    [sessionId],
  );
  const players = new Map<string, GatePaid>();
  const trials = new Map<string, GatePaid>();
  let total = 0;
  for (const r of rows) {
    const paid = { amountPence: r.amount_pence, at: iso(r.taken_at) };
    if (r.player_id) players.set(r.player_id, paid);
    if (r.trial_id) trials.set(r.trial_id, paid);
    total += r.amount_pence;
  }
  return { players, trials, total, count: rows.length };
}
