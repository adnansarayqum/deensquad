import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { runMonthlySummary } from "@/lib/admin/summary-run";
import { enqueue } from "@/lib/background";
import { purgeExpiredSessions } from "@/lib/auth/service";
import { runChase } from "@/lib/chase/run";
import { asSystem } from "@/lib/db";
import { runPlanNotifications } from "@/lib/plans/run";
import { localiseProductImages } from "@/lib/shop/images";

// Called every hour by the Railway cron job with `Authorization: Bearer <CRON_SECRET>`. The chase ladder is the
// job; everything else is best-effort and can't stop it: plan notifications and the owner's monthly summary (on the
// 1st) never throw, long-expired sign-in sessions are cleared, and the copying-in of linked shop photos (slow hosts,
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
    const result = { ...(await runChase()), plans: await runPlanNotifications(), summary: await runMonthlySummary(), sessionsPurged: await purgeSessions() };
    console.info("[chase]", JSON.stringify(result));
    after(() => enqueue("shop photo copy", () => localiseProductImages()));
    return Response.json(result);
  } catch (error) {
    console.error("[chase] failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
