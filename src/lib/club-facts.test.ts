import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../test/db";
import { clubFactLines, loadClubFacts } from "./club-facts";

// Real facts on the sign-up and trial pages: each line only while the club's records support it.

const NOW = new Date("2026-11-08T12:00:00Z"); // a Sunday

describe("club facts", () => {
  let t: Awaited<ReturnType<typeof testDatabase>>;
  const id: Record<string, string> = {};
  const facts = () => t.asSystem((tx) => loadClubFacts(tx, NOW));

  beforeAll(async () => {
    t = await testDatabase();
    await t.asSystem(async (tx) => {
      const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params))[0].id;
      id.monju = await one(`insert into staff (email, display_name, role) values ('monju@x.test', 'Coach Monju', 'admin') returning id`);
      id.hamza = await one(`insert into staff (email, display_name, role) values ('hamza@x.test', 'Coach Hamza', 'coach') returning id`);
    });
  });

  it("says nothing it can't back up", async () => {
    const f = await facts();
    expect(f).toEqual({ children: 0, everyoneDbsChecked: false, training: null });
    expect(clubFactLines(f)).toEqual([]);
  });

  it("DBS line only once every member of staff has a DBS check that hasn't run out", async () => {
    await t.asSystem((tx) => tx.query(`insert into staff_checks (staff_id, kind, expires_on) values ($1, 'dbs', '2027-06-01')`, [id.monju]));
    expect((await facts()).everyoneDbsChecked).toBe(false);
    // Hamza's ran out: still no line.
    await t.asSystem((tx) => tx.query(`insert into staff_checks (staff_id, kind, expires_on) values ($1, 'dbs', '2026-11-01')`, [id.hamza]));
    expect((await facts()).everyoneDbsChecked).toBe(false);
    await t.asSystem((tx) => tx.query(`insert into staff_checks (staff_id, kind) values ($1, 'dbs')`, [id.hamza]));
    expect((await facts()).everyoneDbsChecked).toBe(true);
  });

  it("counts approved children only, and shows the count from 20", async () => {
    await t.asSystem(async (tx) => {
      for (let i = 0; i < 19; i++) await tx.query(`insert into players (first_name, last_name, age_group) values ($1, 'Test', 'U7')`, [`Child${i}`]);
      await tx.query(`insert into players (first_name, last_name, age_group, approved_at) values ('Waiting', 'Test', 'U7', null)`);
    });
    expect((await facts()).children).toBe(19);
    expect(clubFactLines(await facts()).some((l) => l.icon === "children")).toBe(false);
    await t.asSystem((tx) => tx.query(`insert into players (first_name, last_name, age_group) values ('Twenty', 'Test', 'U7')`));
    expect(clubFactLines(await facts())).toContainEqual({ icon: "children", text: "20 children train with the club" });
  });

  it("the usual training night and place, only when it's most of the coming sessions and the venue is known", async () => {
    const session = (startsAt: string, venue: string, cancelled = false) =>
      t.asSystem((tx) =>
        tx.query(
          `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups, cancelled_at) values ('training', 'Training', $1, $1::timestamptz + interval '90 minutes', $2, '{U7}', $3)`,
          [startsAt, venue, cancelled ? NOW : null],
        ),
      );
    await session("2026-11-13T18:30:00Z", "Bobby Moore Sports Hub");
    await session("2026-11-15T10:00:00Z", "Venue to be confirmed");
    // One each: no majority, no line.
    expect((await facts()).training).toBeNull();
    await session("2026-11-20T18:30:00Z", "Bobby Moore Sports Hub");
    await session("2026-11-27T18:30:00Z", "Bobby Moore Sports Hub", true); // cancelled: not counted
    await session("2026-12-04T18:30:00Z", "Bobby Moore Sports Hub");
    expect((await facts()).training).toEqual({ weekday: "Friday", venue: "Bobby Moore Sports Hub" });
    expect(clubFactLines(await facts())[0]).toEqual({ icon: "pitch", text: "Training Fridays at Bobby Moore Sports Hub" });
  });
});
