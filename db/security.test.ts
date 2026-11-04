// Database guards for the security checklist (4 Nov 2026): RLS on, and every record checked against who owns it.
// Structural, so a new table or function added later without these fails here before it ships.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS } from "@/lib/db/dev-seed";
import { testDatabase } from "../test/db";

let t: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  t = await testDatabase({ seed: true });
}, 120_000);

/** The helpers that tie a row to the person asking (their family, their own record, or staff). */
const OWNER_CHECKS = ["my_player_ids()", "my_guardian_id()", "is_staff()", "is_admin()", "can_see_medical(", "staff_covers(", "auth.uid()", "my_staff_id()"];

describe("row level security", () => {
  it("is on for every table signed-in people can touch", async () => {
    const open = await t.asSystem((tx) =>
      tx.query<{ t: string }>(
        `select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind in ('r', 'p') and n.nspname in ('public', 'auth') and not c.relrowsecurity
           and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert,update,delete'))`,
      ),
    );
    expect(open.map((r) => r.t)).toEqual([]);
  });

  it("has no policy that lets everyone in", async () => {
    const wide = await t.asSystem((tx) =>
      tx.query<{ p: string }>(
        `select tablename || ': ' || policyname as p from pg_policies
         where schemaname = 'public' and (coalesce(qual, '') in ('true', '(true)') or coalesce(with_check, '') in ('true', '(true)'))`,
      ),
    );
    expect(wide.map((r) => r.p)).toEqual([]);
  });

  it("checks who owns each record on every table about a child or a parent", async () => {
    const policies = await t.asSystem((tx) =>
      tx.query<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
        `select p.tablename, p.policyname, p.qual, p.with_check from pg_policies p
         where p.schemaname = 'public' and p.tablename in (
           select table_name from information_schema.columns where table_schema = 'public' and column_name in ('player_id', 'guardian_id'))`,
      ),
    );
    const unchecked = policies.filter((p) => [p.qual, p.with_check].some((rule) => rule !== null && !OWNER_CHECKS.some((h) => rule.includes(h))));
    expect(unchecked.map((p) => `${p.tablename}: ${p.policyname}`)).toEqual([]);
    // And every such table has at least one policy (RLS on with none would lock even the family out, which the
    // first test wouldn't catch).
    const tables = await t.asSystem((tx) =>
      tx.query<{ t: string }>(
        `select distinct c.table_name as t from information_schema.columns c join information_schema.tables x
           on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
         where c.table_schema = 'public' and c.column_name in ('player_id', 'guardian_id')
           and has_table_privilege('authenticated', format('public.%I', c.table_name), 'select')`,
      ),
    );
    const withPolicy = new Set(policies.map((p) => p.tablename));
    expect(tables.map((r) => r.t).filter((name) => !withPolicy.has(name))).toEqual([]);
  });

  it("shows a parent no other family's rows, on any table with a child or parent column", async () => {
    const tables = await t.asSystem((tx) =>
      tx.query<{ t: string; c: string }>(
        `select c.table_name as t, c.column_name as c from information_schema.columns c join information_schema.tables x
           on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
         where c.table_schema = 'public' and c.column_name in ('player_id', 'guardian_id')`,
      ),
    );
    const parent = await t.signIn(DEV_EMAILS.parent);
    const leaks: string[] = [];
    for (const { t: table, c: column } of tables) {
      const n = await t
        .asUser(parent, async (tx) => {
          const sql =
            column === "player_id"
              ? `select count(*)::int as n from ${table} where player_id is not null and player_id not in (select my_player_ids())`
              : `select count(*)::int as n from ${table} where guardian_id is not null and guardian_id <> my_guardian_id()
                   and guardian_id not in (select pg.guardian_id from player_guardians pg where pg.player_id in (select my_player_ids()))`;
          return (await tx.query<{ n: number }>(sql))[0].n;
        })
        .catch(() => 0); // no select grant at all: nothing to leak
      if (n > 0) leaks.push(`${table}.${column}: ${n}`);
    }
    expect(leaks).toEqual([]);
  });
});

describe("functions and views", () => {
  it("every security-definer function pins its search_path (so a planted function can't be run as the owner)", async () => {
    const loose = await t.asSystem((tx) =>
      tx.query<{ f: string }>(
        `select n.nspname || '.' || p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'auth') and p.prosecdef
           and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')`,
      ),
    );
    expect(loose.map((r) => r.f)).toEqual([]);
  });

  it("views run as the person asking, except staff_names, which carries no email", async () => {
    const views = await t.asSystem((tx) =>
      tx.query<{ v: string; invoker: boolean }>(
        `select c.relname as v, coalesce('security_invoker=true' = any (c.reloptions), false) as invoker
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind = 'v' and n.nspname = 'public' and has_table_privilege('authenticated', c.oid, 'select')`,
      ),
    );
    expect(views.filter((v) => !v.invoker).map((v) => v.v)).toEqual(["staff_names"]);
    const columns = await t.asSystem((tx) => tx.query<{ c: string }>(`select column_name as c from information_schema.columns where table_name = 'staff_names'`));
    expect(columns.map((c) => c.c)).not.toContain("email");
  });
});
