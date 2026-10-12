import { FoldCard, Notice } from "@/components/admin/bits";
import { shortDay } from "@/lib/dates";
import { REMINDER_WINDOW_DAYS, reminderWhen, weekdayName } from "@/lib/reminders/attendance";
import { saveAttendanceReminder } from "@/lib/reminders/actions";
import { REMINDER_HOURS, type AttendanceReminder } from "@/lib/settings";

const DAYS = [1, 2, 3, 4, 5, 6, 0];

/**
 * Admin → Sessions: the weekly "Is <child> coming?" reminder (src/lib/reminders). Folded, so the sessions list stays
 * on the first screen; the title says when it goes (or Off). A plain form, admins only.
 */
export function WeeklyReminderCard({ setting, last, notice }: { setting: AttendanceReminder; last: { at: string; parents: number } | null; notice?: string }) {
  const when = reminderWhen(setting);
  return (
    <FoldCard id="weekly-reminder" title={`Weekly reminder: ${setting.enabled ? when : "Off"}`} open={Boolean(notice)}>
      <div className="flex flex-col gap-3 lg:max-w-3xl">
        {notice === "saved" ? <Notice>Saved.</Notice> : null}
        {notice === "invalid" ? <Notice tone="action">Choose a day and a time between 08:00 and 20:00.</Notice> : null}
        <p className="text-[15px] leading-[22px]">
          {setting.enabled ? `${when}` : "When it's on"}, parents who haven&apos;t said if their child is coming to their next session (in the next {REMINDER_WINDOW_DAYS} days) get one app
          notification, or an email if they haven&apos;t turned notifications on. Each parent once per session.
        </p>
        <p className="text-[15px] text-ink-muted">{last ? `Last sent: ${shortDay(last.at)}, ${last.parents} ${last.parents === 1 ? "parent" : "parents"}` : "Not sent yet."}</p>
        <form action={saveAttendanceReminder} className="flex flex-col gap-3">
          <label className="flex min-h-12 items-center gap-2 text-[15px] font-bold">
            <input type="checkbox" name="enabled" value="yes" defaultChecked={setting.enabled} className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
            Send the weekly reminder
          </label>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="reminder-day" className="field-label">
                Day
              </label>
              <select id="reminder-day" name="day" defaultValue={String(setting.day)} className="field">
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {weekdayName(d)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="reminder-hour" className="field-label">
                Time
              </label>
              <select id="reminder-hour" name="hour" defaultValue={String(setting.hour)} className="field">
                {REMINDER_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn-chunky btn-paper self-start">
            Save reminder
          </button>
        </form>
      </div>
    </FoldCard>
  );
}
