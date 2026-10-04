import { seedDev } from "@/lib/db/dev-seed";
import { pgliteDatabase } from "@/lib/db/drivers";
import { migrate } from "@/lib/db/migrate";
import { runAsUser } from "@/lib/db/scope";
import type { Queryable } from "@/lib/db/types";

/** A fresh in-memory Postgres with every migration applied, optionally holding the sample club. */
export async function testDatabase({ seed = false, now }: { seed?: boolean; now?: Date } = {}) {
  const db = await pgliteDatabase();
  await migrate(db);
  if (seed) await db.transaction((tx) => seedDev(tx, now));
  return {
    db,
    asSystem: <T>(fn: (tx: Queryable) => Promise<T>) => db.transaction(fn),
    asUser: <T>(userId: string, fn: (tx: Queryable) => Promise<T>) => runAsUser(db, userId, fn),
    /** Creates a sign-in for `email` and links it to the matching guardian or staff row, as sign-in does. */
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
  };
}
