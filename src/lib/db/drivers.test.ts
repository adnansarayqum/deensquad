import { describe, expect, it } from "vitest";
import { pgliteDatabase, postgresDatabase } from "./drivers";
import type { Database } from "./types";

// Savepoints must behave the same on both drivers: a failed statement inside one undoes only its own
// writes, and the transaction still commits. (postgres.js fails a whole transaction after any failed
// statement unless it ran inside its own savepoint scope.) Set TEST_POSTGRES_URL to an empty
// throwaway database to check real Postgres too.

const drivers: [string, (() => Promise<Database>) | null][] = [
  ["PGlite", () => pgliteDatabase()],
  ["postgres.js", process.env.TEST_POSTGRES_URL ? () => postgresDatabase(process.env.TEST_POSTGRES_URL!) : null],
];

describe.each(drivers)("savepoints on %s", (_name, open) => {
  it.runIf(open)("undo only the failed part and let the rest commit", async () => {
    const db = await open!();
    try {
      await db.exec("drop table if exists savepoint_check; create table savepoint_check (x int)");
      const outcome = await db.transaction(async (tx) => {
        await tx.query("insert into savepoint_check values (1)");
        const failed = await tx
          .savepoint(async (sp) => {
            await sp.query("insert into savepoint_check values (2)");
            await sp.query("select 1 / 0");
          })
          .then(() => false, () => true);
        const kept = await tx.savepoint(async (sp) => {
          await sp.query("insert into savepoint_check values (3)");
          return "kept";
        });
        return { failed, kept };
      });
      expect(outcome).toEqual({ failed: true, kept: "kept" });
      const rows = await db.transaction((tx) => tx.query<{ x: number }>("select x from savepoint_check order by x"));
      expect(rows.map((r) => r.x)).toEqual([1, 3]);
    } finally {
      await db.exec("drop table if exists savepoint_check").catch(() => {});
      await db.close();
    }
  });
});
