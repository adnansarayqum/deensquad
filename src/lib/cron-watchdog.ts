import "server-only";

import { sendErrorAlert } from "./alerts";
import { lastHeartbeat, staleHeartbeat } from "./cron-heartbeat";
import { asSystem } from "./db";

const CHECK_EVERY_MS = 30 * 60 * 1000;
/** The stale run already emailed about, so one stoppage sends one email. */
let alertedFor: number | null = null;

const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" });

export async function checkCronHeartbeat(now = new Date()): Promise<"ok" | "stale" | "unknown"> {
  try {
    const stale = staleHeartbeat(await asSystem((tx) => lastHeartbeat(tx)), now);
    if (!stale) {
      alertedFor = null;
      return "ok";
    }
    if (alertedFor !== stale.getTime()) {
      alertedFor = stale.getTime();
      await sendErrorAlert({
        message: `The hourly jobs last ran ${when.format(stale)}. Reminders, notifications and the chase aren't going out. Check the chase-ladder cron in Railway.`,
        path: "/api/cron/chase",
        kind: "cron watchdog",
      });
    }
    return "stale";
  } catch (error) {
    console.error("[cron watchdog] check failed:", error instanceof Error ? error.message : error);
    return "unknown";
  }
}

/** Production only, and only where the cron is set up (CRON_SECRET). */
export function startCronWatchdog(): void {
  if (process.env.NODE_ENV !== "production" || !process.env.CRON_SECRET) return;
  const timer = setInterval(() => void checkCronHeartbeat(), CHECK_EVERY_MS);
  timer.unref?.();
}
