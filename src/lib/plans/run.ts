import "server-only";

import { pushToUsers } from "../chase/senders";
import { asSystem } from "../db";
import { notifyPending } from "./notify";

/** Announces new plans and sheets now (or, overnight, at the next hourly run after 8am). Never throws. */
export async function runPlanNotifications(now = new Date()) {
  try {
    return await asSystem((tx) => notifyPending(tx, now, pushToUsers));
  } catch (error) {
    console.error("[plans] notify failed:", error instanceof Error ? error.message : error);
    return { plans: 0, sheets: 0 };
  }
}
