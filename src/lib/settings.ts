import type { Queryable } from "./db/types";

// Club settings (migration 0026 `club_settings`): one JSON value per key, read by anyone signed in, written by admins
// only (row level security). An absent key means the default: on, for both progress for parents (migration 0028: the
// club switched everything on; switching off stores false) and the weekly attendance reminder.

/** Whether parents see their children's ratings and published progress reports (Admin: on /coach/ratings). */
export const PROGRESS_FOR_PARENTS = "progress_for_parents";

export async function progressForParents(tx: Queryable): Promise<boolean> {
  const [row] = await tx.query<{ shown: boolean }>(`select progress_visible() as shown`);
  return row?.shown === true;
}

/**
 * Switches progress for parents on or off, as the signed-in admin (a coach's write matches no policy and throws).
 * Returns the previous value, so the caller knows whether anything changed.
 */
export async function setProgressForParents(tx: Queryable, on: boolean, staffId: string): Promise<boolean> {
  const was = await progressForParents(tx);
  await tx.query(
    `insert into club_settings (key, value, updated_at, updated_by) values ($1, $2::text::jsonb, now(), $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [PROGRESS_FOR_PARENTS, JSON.stringify(on), staffId],
  );
  return was;
}

/** The weekly "Is <child> coming?" reminder (src/lib/reminders): which London weekday (0 = Sunday) and from which hour. */
export const ATTENDANCE_REMINDER = "attendance_reminder";

export type AttendanceReminder = { enabled: boolean; day: number; hour: number };

/** Unlike the other settings, absent means on: the owner asked for it every Wednesday at 5pm. */
export const DEFAULT_ATTENDANCE_REMINDER: AttendanceReminder = { enabled: true, day: 3, hour: 17 };

/** The hours an admin can choose (8am to 8pm): the reminder never goes in quiet hours (9pm–8am). */
export const REMINDER_HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

/** A stored value read leniently: anything missing or out of range falls back to the default for that field. */
export function parseAttendanceReminder(value: unknown): AttendanceReminder {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const d = DEFAULT_ATTENDANCE_REMINDER;
  const int = (x: unknown, min: number, max: number, fallback: number) => (typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : fallback);
  return { enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled, day: int(v.day, 0, 6, d.day), hour: int(v.hour, 0, 23, d.hour) };
}

export async function attendanceReminderSetting(tx: Queryable): Promise<AttendanceReminder> {
  // As text, so both drivers return the same shape.
  const [row] = await tx.query<{ value: string }>(`select value::text as value from club_settings where key = $1`, [ATTENDANCE_REMINDER]);
  return row ? parseAttendanceReminder(JSON.parse(row.value)) : DEFAULT_ATTENDANCE_REMINDER;
}

/** Saves the reminder setting as the signed-in admin (a coach's write matches no policy and throws). */
export async function setAttendanceReminder(tx: Queryable, value: AttendanceReminder, staffId: string): Promise<void> {
  await tx.query(
    `insert into club_settings (key, value, updated_at, updated_by) values ($1, $2::text::jsonb, now(), $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [ATTENDANCE_REMINDER, JSON.stringify(value), staffId],
  );
}

/**
 * The session fee taken at the gate from pay-as-you-go families and trial children (src/lib/gate), in pence. Absent
 * means £7 (the owner's figure, Oct 2026: paid by card on the club's machine). Admins change it on Admin → Sessions.
 */
export const SESSION_FEE = "session_fee_pence";
export const DEFAULT_SESSION_FEE_PENCE = 700;
/** The most an admin can set (a typo guard). */
export const MAX_SESSION_FEE_PENCE = 10_000;

export async function sessionFeePence(tx: Queryable): Promise<number> {
  const [row] = await tx.query<{ value: string }>(`select value::text as value from club_settings where key = $1`, [SESSION_FEE]);
  const n = row ? Number(JSON.parse(row.value)) : NaN;
  return Number.isInteger(n) && n > 0 && n <= MAX_SESSION_FEE_PENCE ? n : DEFAULT_SESSION_FEE_PENCE;
}

/** Saves the session fee as the signed-in admin (a coach's write matches no policy and throws). */
export async function setSessionFeePence(tx: Queryable, pence: number, staffId: string): Promise<void> {
  await tx.query(
    `insert into club_settings (key, value, updated_at, updated_by) values ($1, $2::text::jsonb, now(), $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [SESSION_FEE, JSON.stringify(pence), staffId],
  );
}

/** "£7" or "£7.50". */
export function poundsText(pence: number): string {
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;
}

/** "12" → 1200, "7.50" → 750; null for anything that isn't a sensible fee. */
export function parseFee(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.trim().replace(/^£/, "").match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const pence = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return pence > 0 && pence <= MAX_SESSION_FEE_PENCE ? pence : null;
}
