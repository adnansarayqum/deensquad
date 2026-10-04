import { asSystem } from "@/lib/db";

// Railway's deploy health check: the app is up and can reach the database.
export async function GET() {
  try {
    await asSystem((tx) => tx.query("select 1"));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[health]", error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
