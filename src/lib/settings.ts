import type { Queryable } from "./db/types";

// Club settings (migration 0026 `club_settings`): one JSON value per key, read by anyone signed in, written by admins
// only (row level security). An absent key means the default: off, except the weekly attendance reminder (on).

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
