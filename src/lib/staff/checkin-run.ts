import "server-only";
import { after } from "next/server";
import { reportJobFailure } from "../alerts";
import { asSystem } from "../db";
import { pushConfigured } from "../chase/senders";
import { SETTLE_SECONDS, sendCheckInNotices } from "./checkin-notices";

/**
 * After a check-in (Mark here or a scan): once it has stood for a minute, tell the child's parents. A timer, not the
 * background queue, so the wait holds nothing else up. Never throws.
 */
export function tellParentsOfCheckIn(): void {
  if (!pushConfigured()) return;
  after(async () => {
    await new Promise((done) => setTimeout(done, (SETTLE_SECONDS + 10) * 1000));
    try {
      await asSystem((tx) => sendCheckInNotices(tx, new Date()));
    } catch (error) {
      reportJobFailure("check-in notices", error);
    }
  });
}
