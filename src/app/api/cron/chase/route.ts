import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { runMonthlySummary } from "@/lib/admin/summary-run";
import { enqueue } from "@/lib/background";
import { purgeExpiredSessions } from "@/lib/auth/service";
import { runChase } from "@/lib/chase/run";
import { runMessageNotices } from "@/lib/messages/run";
import { asSystem } from "@/lib/db";
import { runPlanNotifications } from "@/lib/plans/run";
import { runAttendanceReminder } from "@/lib/reminders/run";
import { localiseProductImages } from "@/lib/shop/images";
import { runTrialFollowUps } from "@/lib/trials/run";

// Called every hour by the Railway cron job with `Authorization: Bearer <CRON_SECRET>`. The chase ladder is the
// job; everything else is best-effort and can't stop it: plan notifications, message notifications held back by
// quiet hours or the 15-minute gap (src/lib/messages/notify.ts), the weekly "Is <child> coming?" reminder
// (src/lib/reminders, on its day from its hour) and the owner's monthly summary (on the
// 1st) and the trial follow-ups (src/lib/trials: "join the club" emails, old bookings anonymised) never throw, long-expired sign-in sessions are cleared, and the copying-in of linked shop photos (slow hosts,
// 20 s each) runs after the response has gone, one task at a time with the app's other background work.

function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
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
    const result = { ...(await runChase()), plans: await runPlanNotifications(), messages: await runMessageNotices(), attendanceReminder: await runAttendanceReminder(), summary: await runMonthlySummary(), trials: await runTrialFollowUps(), sessionsPurged: await purgeSessions() };
    console.info("[chase]", JSON.stringify(result));
    after(() => enqueue("shop photo copy", () => localiseProductImages()));
    return Response.json(result);
  } catch (error) {
    console.error("[chase] failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
