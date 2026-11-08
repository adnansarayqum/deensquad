import "server-only";
import { reportJobFailure } from "@/lib/alerts";

import { pushConfigured, pushToEach } from "../chase/senders";
import { appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { sendMilestoneNotices, type MilestoneSenders } from "./milestones";
import { sendAwardNotices } from "./award-notices";

function liveSenders(): MilestoneSenders {
  return {
    pushUsers: async (tx) => new Set((await tx.query<{ user_id: string }>(`select distinct user_id from push_subscriptions`)).map((r) => r.user_id)),
    ...(pushConfigured() ? { push: (tx, payloads) => pushToEach(tx, payloads) } : {}),
    ...(canSendEmail() && appUrl() ? { email: sendEmails } : {}),
    appUrl: appUrl(),
  };
}

/** The 20-point reward notices: after points are given (`after()`), and hourly from the cron as the retry. Never throws. */
export async function runPointsMilestones(now = new Date()): Promise<{ reached: number; admins: number; parents: number }> {
  try {
    return await asSystem((tx) => sendMilestoneNotices(tx, now, liveSenders()));
  } catch (error) {
    reportJobFailure("points reward", error);
    return { reached: 0, admins: 0, parents: 0 };
  }
}

/** Stars, points and badges told to the parents (hourly from the cron, once the coaches have finished). Never throws. */
export async function runAwardNotices(now = new Date()): Promise<{ children: number; told: number }> {
  try {
    return await asSystem((tx) => sendAwardNotices(tx, now, liveSenders()));
  } catch (error) {
    reportJobFailure("award notices", error);
    return { children: 0, told: 0 };
  }
}
