import { asSystem } from "@/lib/db";

// Railway's deploy health check: the app is up, can reach the database, and the schema is migrated.
// Also reports the database round trip, so a database far from the app shows up.
export async function GET() {
  try {
    const started = performance.now();
    await asSystem((tx) => tx.query("select 1"));
    const dbMs = Math.round(performance.now() - started);
    const [{ n }] = await asSystem((tx) => tx.query<{ n: number }>("select count(*)::int as n from public.schema_migrations"));
    return Response.json({ ok: true, migrations: n, dbMs });
  } catch (error) {
    console.error("[health]", error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
