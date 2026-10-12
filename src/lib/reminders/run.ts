import "server-only";

import { pushConfigured, pushToEach } from "../chase/senders";
import { appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { sendAttendanceReminders, type ReminderResult, type ReminderSenders } from "./attendance";

function liveSenders(): ReminderSenders {
  return {
    pushUsers: async (tx) => new Set((await tx.query<{ user_id: string }>(`select distinct user_id from push_subscriptions`)).map((r) => r.user_id)),
    ...(pushConfigured() ? { push: (tx, payloads) => pushToEach(tx, payloads) } : {}),
    ...(canSendEmail() && appUrl() ? { email: sendEmails } : {}),
    appUrl: appUrl(),
  };
}

/** The weekly "Is <child> coming?" reminder, from the hourly cron. Never throws. */
export async function runAttendanceReminder(now = new Date()): Promise<ReminderResult> {
  try {
    return await asSystem((tx) => sendAttendanceReminders(tx, now, liveSenders()));
  } catch (error) {
    console.error("[attendance reminder] failed:", error instanceof Error ? error.message : error);
    return { due: false, push: 0, email: 0 };
  }
}
