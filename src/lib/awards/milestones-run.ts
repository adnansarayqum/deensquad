import "server-only";

import { pushConfigured, pushToEach } from "../chase/senders";
import { appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { sendMilestoneNotices, type MilestoneSenders } from "./milestones";

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
    console.error("[points reward] failed:", error instanceof Error ? error.message : error);
    return { reached: 0, admins: 0, parents: 0 };
  }
}
