import type { TransactionSql } from "postgres";
import type { Database, Queryable } from "./types";

/**
 * Railway (and any real Postgres): a postgres.js pool. 15 by default: a parent page runs several short transactions,
 * a news post's reminder run holds one for its whole send, and Railway's Postgres allows 100.
 * A statement running over 30 s is stopped, so a runaway query can't hold a connection for ever.
 */
export async function postgresDatabase(url: string): Promise<Database> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 15),
    idle_timeout: 30,
    connect_timeout: 10,
    connection: { statement_timeout: 30_000 },
    onnotice: () => {},
  });
  // postgres.js remembers any failed statement in a transaction and rolls it all back, even if the
  // error was caught, so savepoints must go through its own tx.savepoint() rather than raw SQL.
  const wrap = (tx: TransactionSql): Queryable => ({
    query: (text, params = []) => tx.unsafe(text, params as never[]) as unknown as Promise<never[]>,
    script: async (text) => {
      await tx.unsafe(text);
    },
    savepoint: async (fn) => ((await tx.savepoint(async (sp) => ({ value: await fn(wrap(sp)) }))) as { value: never }).value,
  });
  return {
    async transaction(fn) {
      const result = await sql.begin(async (tx) => ({ value: await fn(wrap(tx)) }));
      return (result as { value: Awaited<ReturnType<typeof fn>> }).value;
    },
    async exec(text) {
      await sql.unsafe(text);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Local development and tests: Postgres compiled to WebAssembly, in memory or in a folder. */
export async function pgliteDatabase(dataDir?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  let savepoints = 0;
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const wrap = (tx: Tx): Queryable => {
    const q: Queryable = {
      query: async (text, params = []) => (await tx.query(text, params as unknown[])).rows as never[],
      script: async (text) => {
        await tx.exec(text);
      },
      async savepoint(fn) {
        const name = `sp_${++savepoints}`;
        await tx.query(`savepoint ${name}`);
        try {
          const value = await fn(q);
          await tx.query(`release savepoint ${name}`);
          return value;
        } catch (error) {
          await tx.query(`rollback to savepoint ${name}`);
          await tx.query(`release savepoint ${name}`);
          throw error;
        }
      },
    };
    return q;
  };
  return {
    transaction(fn) {
      return db.transaction(async (tx) => fn(wrap(tx)));
    },
    async exec(text) {
      await db.exec(text);
    },
    async close() {
      await db.close();
    },
  };
}
