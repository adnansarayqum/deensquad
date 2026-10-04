import "server-only";

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { seedDev } from "./dev-seed";
import { pgliteDatabase, postgresDatabase } from "./drivers";
import { migrate } from "./migrate";
import { runAsUser } from "./scope";
import type { Database, Queryable } from "./types";

// One database per server process.
//   DATABASE_URL=postgres://…        Railway (migrations run before deploy: scripts/migrate.mjs)
//   DATABASE_URL=pglite://memory     in-memory Postgres (end-to-end tests)
//   DATABASE_URL=pglite://.data/db   Postgres in a local folder (the default for `npm run dev`)
// DEV_SEED=1 fills an empty database with the sample club. It refuses to run on Railway.

const store = globalThis as unknown as { __deenSquadDb?: Promise<Database> };

export function getDatabase(): Promise<Database> {
  store.__deenSquadDb ??= open().catch((error) => {
    store.__deenSquadDb = undefined;
    throw error;
  });
  return store.__deenSquadDb;
}

async function open(): Promise<Database> {
  const url = process.env.DATABASE_URL ?? (process.env.NODE_ENV === "production" ? undefined : "pglite://.data/db");
  if (!url) throw new Error("DATABASE_URL is not set.");

  const isPglite = url.startsWith("pglite://");
  let db: Database;
  if (isPglite) {
    const target = url.slice("pglite://".length);
    if (target === "memory") {
      db = await pgliteDatabase();
    } else {
      const dir = resolve(/*turbopackIgnore: true*/ target);
      mkdirSync(dir, { recursive: true });
      db = await pgliteDatabase(dir);
    }
  } else {
    db = await postgresDatabase(url);
  }

  const wantsSeed = process.env.DEV_SEED === "1" || (isPglite && process.env.DEV_SEED !== "0");
  if (isPglite || wantsSeed) await migrate(db);
  if (wantsSeed) {
    // On Railway the sample club is only allowed in the demo copy, which keeps its data in memory.
    if (process.env.RAILWAY_ENVIRONMENT && !(isDemo() && isPglite)) throw new Error("DEV_SEED must not be used on Railway.");
    await db.transaction(async (tx) => {
      const [{ n }] = await tx.query<{ n: number }>("select count(*)::int as n from guardians");
      if (n === 0) await seedDev(tx);
    });
  }
  return db;
}

/** The demo copy of the app: sample club in memory, one-tap sign-in, nothing sent. Never on the real app. */
export function isDemo(): boolean {
  return process.env.DEMO_MODE === "1" && (process.env.DATABASE_URL ?? "").startsWith("pglite://");
}

/** Runs `fn` as a signed-in user: row level security applies to every statement. */
export async function asUser<T>(userId: string, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return runAsUser(await getDatabase(), userId, fn);
}

/** Runs `fn` as the database owner, bypassing row level security. Only for sign-in and sessions. */
export async function asSystem<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  return db.transaction(fn);
}
