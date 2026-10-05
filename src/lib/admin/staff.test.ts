import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import { changeStaffRole } from "./staff";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let ids: { admin: string; coach: string };

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
  const rows = await t.asSystem((tx) => tx.query<{ id: string; email: string }>(`select id, email from staff`));
  ids = { admin: rows.find((r) => r.email === DEV_EMAILS.admin)!.id, coach: rows.find((r) => r.email === DEV_EMAILS.coach)!.id };
  await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U7}' where id = $1`, [ids.coach]));
});

const staffRow = (id: string) =>
  t.asSystem(async (tx) => (await tx.query<{ role: string; age_groups: string[] }>(`select role::text as role, age_groups::text[] as age_groups from staff where id = $1`, [id]))[0]);

describe("changing a member of staff's role", () => {
  it("makes a coach an admin and clears their groups (admins see every group)", async () => {
    expect(await t.asUser(admin, (tx) => changeStaffRole(tx, ids.coach, "admin"))).toEqual({ ok: true });
    expect(await staffRow(ids.coach)).toEqual({ role: "admin", age_groups: [] });
  });

  it("makes an admin a coach of every group while another admin remains", async () => {
    await t.asUser(admin, (tx) => changeStaffRole(tx, ids.coach, "admin"));
    expect(await t.asUser(admin, (tx) => changeStaffRole(tx, ids.coach, "coach"))).toEqual({ ok: true });
    expect(await staffRow(ids.coach)).toEqual({ role: "coach", age_groups: [] });
  });

  it("never makes the last admin a coach, themselves included", async () => {
    expect(await t.asUser(admin, (tx) => changeStaffRole(tx, ids.admin, "coach"))).toEqual({ ok: false, reason: "last_admin" });
    expect((await staffRow(ids.admin)).role).toBe("admin");
  });

  it("leaves someone already in that role as they are", async () => {
    expect(await t.asUser(admin, (tx) => changeStaffRole(tx, ids.coach, "coach"))).toEqual({ ok: true });
    expect(await staffRow(ids.coach)).toEqual({ role: "coach", age_groups: ["U7"] });
  });

  it("says not found for someone who isn't on the staff list", async () => {
    expect(await t.asUser(admin, (tx) => changeStaffRole(tx, "00000000-0000-4000-8000-000000000000", "admin"))).toEqual({ ok: false, reason: "not_found" });
  });

  it("can't be done by a coach: row level security changes nothing", async () => {
    const coach = await t.signIn(DEV_EMAILS.coach);
    const result = await t.asUser(coach, (tx) => changeStaffRole(tx, ids.coach, "admin")).catch((e: unknown) => e);
    expect(result).not.toEqual({ ok: true });
    expect((await staffRow(ids.coach)).role).toBe("coach");
  });
});
