import "server-only";

import { pushConfigured, pushToUsers } from "../chase/senders";
import { appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { notifyMessages, type NoticeSenders } from "./notify";

function liveSenders(): NoticeSenders {
  return {
    pushUsers: async (tx) => new Set((await tx.query<{ user_id: string }>(`select distinct user_id from push_subscriptions`)).map((r) => r.user_id)),
    ...(pushConfigured() ? { push: (tx, userIds, payload) => pushToUsers(tx, userIds, payload) } : {}),
    ...(canSendEmail() && appUrl() ? { email: sendEmails } : {}),
    appUrl: appUrl(),
  };
}

/**
 * Tells people about new messages: one conversation right after a message is sent, or every conversation (the hourly
 * job, which catches anything held back overnight or by the 15-minute gap). Never throws.
 */
export async function runMessageNotices(opts: { conversationId?: string; now?: Date } = {}) {
  try {
    return await asSystem((tx) => notifyMessages(tx, opts.now ?? new Date(), liveSenders(), opts.conversationId ?? null));
  } catch (error) {
    console.error("[messages] notify failed:", error instanceof Error ? error.message : error);
    return { quiet: false, push: 0, email: 0 };
  }
}
