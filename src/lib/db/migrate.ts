import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "./types";

// Applies db/migrations/*.sql in name order, each once, all in one transaction.
// Railway runs the same logic before each deploy (scripts/migrate.mjs); keep the two in step.

export type Migration = { name: string; sql: string };

export function loadMigrations(dir = join(process.cwd(), "db", "migrations")): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

export async function migrate(db: Database, migrations: Migration[] = loadMigrations()): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(727274)");
    // As in scripts/migrate.mjs: give up after 5 s waiting for a table lock rather than queue behind it.
    await tx.query("set local lock_timeout = '5s'");
    await tx.query(
      "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const applied = new Set((await tx.query<{ name: string }>("select name from public.schema_migrations")).map((r) => r.name));
    const ran: string[] = [];
    for (const m of migrations) {
      if (applied.has(m.name)) continue;
      await tx.script(m.sql);
      await tx.query("insert into public.schema_migrations (name) values ($1)", [m.name]);
      ran.push(m.name);
    }
    return ran;
  });
}
