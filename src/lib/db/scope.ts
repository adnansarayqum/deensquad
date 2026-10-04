import type { Database, Queryable } from "./types";

/**
 * Runs `fn` as a signed-in user so row level security applies to every statement:
 * switch to the `authenticated` role and set the id that auth.uid() reads, for this transaction only.
 */
export function runAsUser<T>(db: Database, userId: string, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.user_id', $1, true)", [userId]);
    await tx.query("set local role authenticated");
    return fn(tx);
  });
}
