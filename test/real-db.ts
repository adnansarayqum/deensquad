import { randomBytes } from "node:crypto";
import { seedDev } from "@/lib/db/dev-seed";
import { postgresDatabase } from "@/lib/db/drivers";
import { migrate } from "@/lib/db/migrate";
import { runAsUser } from "@/lib/db/scope";
import type { Queryable } from "@/lib/db/types";

// A real Postgres server for the tests PGlite can't run: PGlite is one connection, so two things can never happen at
// the same moment in it. Set CONCURRENCY_DATABASE_URL to a server the tests may create databases on, e.g.
// postgres://postgres@127.0.0.1:5432/postgres (GitHub's run starts one; see .github/workflows/test.yml).

export const REAL_DATABASE_URL = process.env.CONCURRENCY_DATABASE_URL ?? "";

/** A fresh database on that server with every migration applied, optionally holding the sample club. Dropped by `close()`. */
export async function realDatabase({ seed = false, now }: { seed?: boolean; now?: Date } = {}) {
  const name = `ds_test_${randomBytes(6).toString("hex")}`;
  const admin = await postgresDatabase(REAL_DATABASE_URL);
  await admin.exec(`create database ${name}`);
  const url = new URL(REAL_DATABASE_URL);
  url.pathname = `/${name}`;
  const db = await postgresDatabase(url.toString());
  await migrate(db);
  if (seed) await db.transaction((tx) => seedDev(tx, now));
  return {
    db,
    asSystem: <T>(fn: (tx: Queryable) => Promise<T>) => db.transaction(fn),
    asUser: <T>(userId: string, fn: (tx: Queryable) => Promise<T>) => runAsUser(db, userId, fn),
    async signIn(email: string): Promise<string> {
      return db.transaction(async (tx) => {
        const [{ id }] = await tx.query<{ id: string }>(
          `insert into auth.users (email) values ($1) on conflict ((lower(email))) do update set last_sign_in_at = now() returning id`,
          [email],
        );
        await tx.query(`update guardians set auth_user_id = $1 where lower(email) = lower($2) and auth_user_id is null`, [id, email]);
        await tx.query(`update staff set auth_user_id = $1 where lower(email) = lower($2) and auth_user_id is null`, [id, email]);
        return id;
      });
    },
    async close() {
      await db.close();
      await admin.exec(`drop database if exists ${name} with (force)`);
      await admin.close();
    },
  };
}

/**
 * Makes two (or `n`) pieces of work overlap: each calls the returned function part-way through and is held there
 * until all have arrived, or for `ms` at most. Without a lock both arrive and carry on together, which is the race.
 * With a lock the second is still waiting for it, so the first is let go after `ms`, finishes, and the second follows.
 */
export function meet(n = 2, ms = 400): () => Promise<void> {
  let arrived = 0;
  let open: () => void = () => {};
  const all = new Promise<void>((resolve) => (open = resolve));
  return async () => {
    if (++arrived >= n) open();
    await Promise.race([all, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
  };
}
