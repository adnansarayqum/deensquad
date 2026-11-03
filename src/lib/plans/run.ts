import "server-only";
import { reportJobFailure } from "@/lib/alerts";

import { pushToUsers } from "../chase/senders";
import { asSystem } from "../db";
import { notifyPending } from "./notify";

/** Announces new plans and sheets now (or, overnight, at the next hourly run after 8am). Never throws. */
export async function runPlanNotifications(now = new Date()) {
  try {
    return await asSystem((tx) => notifyPending(tx, now, pushToUsers));
  } catch (error) {
    reportJobFailure("plans notify", error);
    return { plans: 0, sheets: 0 };
  }
}
