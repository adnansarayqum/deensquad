import { timingSafeEqual } from "node:crypto";
import { runChase } from "@/lib/chase/run";
import { runPlanNotifications } from "@/lib/plans/run";

// Called every hour by the Railway cron job with `Authorization: Bearer <CRON_SECRET>`.

function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return Response.json({ error: "unauthorised" }, { status: 401 });
  try {
    const result = { ...(await runChase()), plans: await runPlanNotifications() };
    console.info("[chase]", JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    console.error("[chase] failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
