import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { runMonthlySummary } from "@/lib/admin/summary-run";
import { enqueue } from "@/lib/background";
import { purgeExpiredSessions } from "@/lib/auth/service";
import { runChase } from "@/lib/chase/run";
import { reportJobFailure, sendErrorAlert } from "@/lib/alerts";
import { sweepCardPayments } from "@/lib/shop/payments";
import { runMediaCleanup } from "@/lib/media/run";
import { runMessageNotices } from "@/lib/messages/run";
import { asSystem } from "@/lib/db";
import { recordHeartbeat } from "@/lib/cron-heartbeat";
import { runPlanNotifications } from "@/lib/plans/run";
import { runAttendanceReminder } from "@/lib/reminders/run";
import { localiseProductImages } from "@/lib/shop/images";
import { runStaffCheckReminders } from "@/lib/staff-checks/run";
import { runTrialFollowUps } from "@/lib/trials/run";
import { runAwardNotices, runPointsMilestones } from "@/lib/awards/milestones-run";
import { runWellbeingAlerts } from "@/lib/wellbeing/run";

// Called every hour by the Railway cron job with `Authorization: Bearer <CRON_SECRET>`. The chase ladder is the
// job; everything else is best-effort and can't stop it: plan notifications, message notifications held back by
// quiet hours or the 15-minute gap (src/lib/messages/notify.ts), the weekly "Is <child> coming?" reminder
// (src/lib/reminders, on its day from its hour) and the owner's monthly summary (on the
// 1st) and the trial follow-ups (src/lib/trials: "join the club" emails, old bookings anonymised) and staff check reminders (src/lib/staff-checks: a DBS or certificate running out within 60 days) never throw, photos and videos attached to nothing for a day are removed (src/lib/media), long-expired sign-in sessions are cleared, and the copying-in of linked shop photos (slow hosts,
// 20 s each) runs after the response has gone, one task at a time with the app's other background work.

function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Card payments SumUp says went through but no webhook told us about (src/lib/shop/payments.ts). */
async function sweepCards(): Promise<{ checked: number; paid: number }> {
  try {
    return await sweepCardPayments();
  } catch (error) {
    reportJobFailure("card payment check", error);
    return { checked: 0, paid: 0 };
  }
}

async function purgeSessions(): Promise<number> {
  try {
    return await asSystem((tx) => purgeExpiredSessions(tx));
  } catch (error) {
    console.error("[sessions] purge failed:", error instanceof Error ? error.message : error);
    return 0;
  }
}

export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return Response.json({ error: "unauthorised" }, { status: 401 });
  try {
    // The chase in its own try/catch like every other job, so a fault in it can't stop the rest (or the next hour's).
    const chase = await runChase().catch((error: unknown) => {
      console.error("[chase] ladder failed:", error instanceof Error ? error.message : error);
      void sendErrorAlert({ message: `The hourly reminders failed: ${error instanceof Error ? error.message : String(error)}`, path: "/api/cron/chase", kind: "cron job" });
      return { failed: ["chase"] };
    });
    const result = { ...chase, plans: await runPlanNotifications(), messages: await runMessageNotices(), attendanceReminder: await runAttendanceReminder(), summary: await runMonthlySummary(), trials: await runTrialFollowUps(), staffChecks: await runStaffCheckReminders(), wellbeing: await runWellbeingAlerts(), pointsReward: await runPointsMilestones(), awards: await runAwardNotices(), media: await runMediaCleanup(), cardPayments: await sweepCards(), sessionsPurged: await purgeSessions() };
    console.info("[chase]", JSON.stringify(result));
    // Read by the watchdog and the admins' overview: a cron that stops being called says so.
    await asSystem((tx) => recordHeartbeat(tx, new Date())).catch((error: unknown) => console.error("[chase] heartbeat:", error instanceof Error ? error.message : error));
    after(() => enqueue("shop photo copy", () => localiseProductImages()));
    return Response.json(result);
  } catch (error) {
    console.error("[chase] failed:", error instanceof Error ? error.message : error);
    await sendErrorAlert({ message: `The hourly jobs failed: ${error instanceof Error ? error.message : String(error)}`, path: "/api/cron/chase", kind: "cron job" });
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
