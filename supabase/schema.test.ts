// Runs the real migration in an in-memory Postgres (PGlite) with a stand-in for Supabase's auth schema,
// then checks the row level security rules as different signed-in users.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./migrations/0001_init.sql", import.meta.url), "utf8");

const ADNAN = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";
const COACH = "00000000-0000-0000-0000-00000000000c";

let db: PGlite;

async function as<T>(userId: string, sql: string): Promise<T[]> {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  const res = await db.query<T>(sql);
  await db.exec("reset role;");
  return res.rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role authenticated;
  `);
  await db.exec(migration);
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public, auth to authenticated;

    insert into auth.users values ('${ADNAN}'), ('${OTHER}'), ('${COACH}');
    insert into staff values ('${COACH}', 'Coach', 'coach');
    insert into guardians (id, auth_user_id, first_name, last_name) values
      ('10000000-0000-0000-0000-000000000001', '${ADNAN}', 'Adnan', 'S'),
      ('10000000-0000-0000-0000-000000000002', '${OTHER}', 'Other', 'Parent');
    insert into players (id, first_name, last_name, age_group) values
      ('20000000-0000-0000-0000-000000000001', 'Yusuf', 'S', 'U9'),
      ('20000000-0000-0000-0000-000000000002', 'Omar', 'P', 'U13');
    insert into player_guardians values
      ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'father'),
      ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'mother');
    insert into sessions (id, title, starts_at, ends_at, venue, age_groups) values
      ('30000000-0000-0000-0000-000000000001', 'U9 training', '2026-10-09 17:30Z', '2026-10-09 19:00Z', 'Bobby Moore Sports Hub', '{U9}'),
      ('30000000-0000-0000-0000-000000000002', 'U13 training', '2026-10-09 17:30Z', '2026-10-09 19:00Z', 'Bobby Moore Sports Hub', '{U13}');
    insert into announcements (id, topic, title, body, audience) values
      ('40000000-0000-0000-0000-000000000001', 'Kit', 'U9 kit', 'Sizes please', '{U9}'),
      ('40000000-0000-0000-0000-000000000002', 'Timing', 'Everyone', 'Winter timings', null),
      ('40000000-0000-0000-0000-000000000003', 'Kit', 'U13 kit', 'Sizes please', '{U13}');
  `);
});

describe("row level security", () => {
  it("shows a parent only their own child", async () => {
    const rows = await as<{ first_name: string }>(ADNAN, "select first_name from players order by first_name");
    expect(rows.map((r) => r.first_name)).toEqual(["Yusuf"]);
  });

  it("shows a parent only sessions and announcements for their child's age group", async () => {
    const sessions = await as<{ title: string }>(ADNAN, "select title from sessions");
    expect(sessions.map((s) => s.title)).toEqual(["U9 training"]);
    const news = await as<{ title: string }>(ADNAN, "select title from announcements order by title");
    expect(news.map((n) => n.title)).toEqual(["Everyone", "U9 kit"]);
  });

  it("lets a parent answer for their own child but not someone else's", async () => {
    await as(ADNAN, "insert into availability (session_id, player_id, answer) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'coming')");
    await expect(
      as(ADNAN, "insert into availability (session_id, player_id, answer) values ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'away')"),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets a parent acknowledge an announcement only as themselves", async () => {
    await as(ADNAN, "insert into announcement_reads (announcement_id, guardian_id) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')");
    await expect(
      as(ADNAN, "insert into announcement_reads (announcement_id, guardian_id) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')"),
    ).rejects.toThrow(/row-level security/);
  });

  it("gives coaches the whole club and the gaps view", async () => {
    const players = await as<{ first_name: string }>(COACH, "select first_name from players");
    expect(players).toHaveLength(2);
    const gaps = await as<{ first_name: string; payment: string; in_app: boolean }>(COACH, "select first_name, payment, in_app from family_gaps order by first_name");
    expect(gaps).toEqual([
      { first_name: "Omar", payment: "missing", in_app: true },
      { first_name: "Yusuf", payment: "missing", in_app: true },
    ]);
  });

  it("stops parents writing to staff-only tables", async () => {
    await expect(
      as(ADNAN, "insert into announcements (topic, title, body) values ('x', 'y', 'z')"),
    ).rejects.toThrow(/row-level security/);
    const chases = await as(ADNAN, "select * from announcement_chases");
    expect(chases).toEqual([]);
  });
});
