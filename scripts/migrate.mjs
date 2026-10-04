// Applies db/migrations/*.sql to DATABASE_URL. Railway runs this before every deploy
// (preDeployCommand in railway.json), so a failed migration stops the deploy.
// Same rules as src/lib/db/migrate.ts: name order, each file once, all in one transaction.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url || url.startsWith("pglite:")) {
  console.log("[migrate] No Postgres DATABASE_URL; nothing to do.");
  process.exit(0);
}

const dir = join(process.cwd(), "db", "migrations");
const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });

try {
  const ran = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727274)`;
    await tx`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await tx`select name from public.schema_migrations`).map((r) => r.name));
    const done = [];
    for (const name of files) {
      if (applied.has(name)) continue;
      await tx.unsafe(readFileSync(join(dir, name), "utf8"));
      await tx`insert into public.schema_migrations (name) values (${name})`;
      done.push(name);
    }
    return done;
  });
  console.log(ran.length ? `[migrate] Applied ${ran.join(", ")}` : "[migrate] Database is up to date.");
} catch (error) {
  console.error("[migrate] Failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
