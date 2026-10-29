import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_MODEL, aiConfigured, callMessages } from "@/lib/ai/claude";
import { askAssistant, MESSAGE_MAX, type Turn } from "@/lib/assistant/run";
import { windowCounter } from "@/lib/calendar/feed";
import { asUser } from "@/lib/db";
import { greetingName } from "@/lib/greeting";

// The admins' assistant (src/lib/assistant). Admins only. A route rather than a Server Action, so a slow answer
// doesn't hold up the page's other actions; the session is checked here. At most 60 questions an hour per admin.
export const maxDuration = 120;

const perAdmin = windowCounter(60);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Your sign-in has run out. Sign in again." }, { status: 401 });
  if (user.staff?.role !== "admin") return Response.json({ error: "The assistant is for the club's admins." }, { status: 403 });
  if (!aiConfigured()) return Response.json({ error: "The assistant isn't switched on yet." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { message?: unknown; history?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Type or say a question first." }, { status: 400 });
  if (message.length > MESSAGE_MAX) return Response.json({ error: `Keep it under ${MESSAGE_MAX} characters.` }, { status: 400 });
  if (!perAdmin.hit(user.staff.id)) return Response.json({ error: "That's a lot of questions this hour. Try again later." }, { status: 429 });
  const history: Turn[] = Array.isArray(body?.history)
    ? body.history
        .filter((t): t is Turn => (t?.role === "user" || t?.role === "assistant") && typeof t?.text === "string" && t.text.trim() !== "")
        .map((t) => ({ role: t.role, text: t.text }))
    : [];
  const staff = user.staff;
  try {
    const answer = await askAssistant(message, history, { now: new Date(), staffId: staff.id, adminName: greetingName(staff.displayName) }, {
      call: (req) => callMessages(req),
      withTx: (fn) => asUser(user.id, fn),
      model: process.env.ANTHROPIC_ASSISTANT_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    });
    return Response.json(answer, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[assistant] failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "The assistant didn't answer. Check your signal and try again." }, { status: 502 });
  }
}
