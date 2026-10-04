import type { Database, Queryable } from "./types";

/** Railway (and any real Postgres): a small postgres.js pool. */
export async function postgresDatabase(url: string): Promise<Database> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return {
    async transaction(fn) {
      const result = await sql.begin(async (tx) => {
        const q: Queryable = {
          query: (text, params = []) => tx.unsafe(text, params as never[]) as unknown as Promise<never[]>,
          script: async (text) => {
            await tx.unsafe(text);
          },
        };
        return { value: await fn(q) };
      });
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
  return {
    transaction(fn) {
      return db.transaction(async (tx) =>
        fn({
          query: async (text, params = []) => (await tx.query(text, params as unknown[])).rows as never[],
          script: async (text) => {
            await tx.exec(text);
          },
        }),
      );
    },
    async exec(text) {
      await db.exec(text);
    },
    async close() {
      await db.close();
    },
  };
}
