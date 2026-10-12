"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "../auth/session";
import { asUser } from "../db";
import { REMINDER_HOURS, setAttendanceReminder } from "../settings";

/** Admin → Sessions: the weekly reminder's on/off, day and hour (8am–8pm). A plain form; admins only. */
export async function saveAttendanceReminder(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const day = Number(formData.get("day"));
  const hour = Number(formData.get("hour"));
  if (!Number.isInteger(day) || day < 0 || day > 6 || !REMINDER_HOURS.includes(hour)) redirect("/admin/sessions?reminder=invalid#weekly-reminder");
  const enabled = formData.get("enabled") === "yes";
  await asUser(user.id, (tx) => setAttendanceReminder(tx, { enabled, day, hour }, user.staff.id));
  redirect("/admin/sessions?reminder=saved#weekly-reminder");
}
