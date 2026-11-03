import type { Queryable } from "./db/types";

// The hourly cron (Railway's `chase-ladder` function) sends every reminder and notification. If it stops being
// called (a paused function, a changed secret), nothing would fail loudly: each run records when it finished, the
// app server checks every half hour and emails the alert address once, and admins see a notice on the overview.

const KEY = "cron_heartbeat";
/** Three missed hourly runs. */
export const HEARTBEAT_STALE_MS = 3 * 60 * 60 * 1000;

export async function recordHeartbeat(tx: Queryable, now: Date): Promise<void> {
  await tx.query(
    `insert into club_settings (key, value, updated_at) values ($1, to_jsonb($2::text), $3::timestamptz)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [KEY, now.toISOString(), now],
  );
}

/** When the hourly jobs last finished, or null if they never have (a new database, or tests). */
export async function lastHeartbeat(tx: Queryable): Promise<Date | null> {
  const [row] = await tx.query<{ at: string | null }>(`select value #>> '{}' as at from club_settings where key = $1`, [KEY]);
  const at = row?.at ? new Date(row.at) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

/** The last run, when it was long enough ago to worry about; else null. */
export function staleHeartbeat(last: Date | null, now: Date): Date | null {
  return last && now.getTime() - last.getTime() > HEARTBEAT_STALE_MS ? last : null;
}
