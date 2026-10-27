// Staff checks on the database: only admins write them, each member of staff reads only their own, parents read
// none; the overview's count matches the people the Staff page marks; the reminder goes once per expiry date.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { londonIsoDay } from "./checks";
import { countStaffNeedingChecks, dueCheckReminders, loadAllStaffChecks, markCheckReminded, saveStaffCheck } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let coach: string;
let parent: string;
let adminStaff: string;
let coachStaff: string;
const NOW = new Date("2026-10-27T12:00:00Z");
const TODAY = londonIsoDay(NOW);

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: NOW });
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  parent = await t.signIn(DEV_EMAILS.parent);
  const ids = await t.asSystem((tx) => tx.query<{ id: string; email: string }>(`select id, email from staff`));
  adminStaff = ids.find((s) => s.email === DEV_EMAILS.admin)!.id;
  coachStaff = ids.find((s) => s.email === DEV_EMAILS.coach)!.id;
});

describe("staff checks", () => {
  it("counts every member of staff with no DBS check at first", async () => {
    expect(await t.asUser(admin, (tx) => countStaffNeedingChecks(tx, TODAY))).toBe(2);
  });

  it("lets an admin record checks, and drops a person from the count once their DBS is in date", async () => {
    await t.asUser(admin, async (tx) => {
      await saveStaffCheck(tx, coachStaff, { kind: "dbs", title: null, reference: "001234567890", issuedOn: "2025-01-10", expiresOn: "2028-01-10" }, adminStaff, null);
      await saveStaffCheck(tx, adminStaff, { kind: "dbs", title: null, reference: null, issuedOn: null, expiresOn: "2029-05-01" }, adminStaff, null);
    });
    expect(await t.asUser(admin, (tx) => countStaffNeedingChecks(tx, TODAY))).toBe(0);
    // A first aid certificate running out in a month puts the coach back on the list, and it's due a reminder.
    await t.asUser(admin, (tx) => saveStaffCheck(tx, coachStaff, { kind: "first_aid", title: "Emergency First Aid", reference: null, issuedOn: null, expiresOn: "2026-11-20" }, adminStaff, null));
    expect(await t.asUser(admin, (tx) => countStaffNeedingChecks(tx, TODAY))).toBe(1);
    const due = await t.asSystem((tx) => dueCheckReminders(tx, TODAY));
    expect(due.map((d) => [d.staffEmail, d.kind])).toEqual([[DEV_EMAILS.coach, "first_aid"]]);
  });

  it("reminds once per expiry date: marking stops it, a new date starts it again", async () => {
    const [due] = await t.asSystem((tx) => dueCheckReminders(tx, TODAY));
    await t.asSystem((tx) => markCheckReminded(tx, [due.id], NOW));
    expect(await t.asSystem((tx) => dueCheckReminders(tx, TODAY))).toEqual([]);
    await t.asUser(admin, (tx) => saveStaffCheck(tx, coachStaff, { kind: "first_aid", title: "Emergency First Aid", reference: null, issuedOn: null, expiresOn: "2026-12-01" }, adminStaff, due.id));
    expect((await t.asSystem((tx) => dueCheckReminders(tx, TODAY))).map((d) => d.id)).toEqual([due.id]);
  });

  it("lets a coach read only their own checks and write none; parents see none", async () => {
    const mine = await t.asUser(coach, (tx) => loadAllStaffChecks(tx));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => c.staffId === coachStaff)).toBe(true);
    await expect(
      t.asUser(coach, (tx) => saveStaffCheck(tx, coachStaff, { kind: "dbs", title: null, reference: null, issuedOn: null, expiresOn: "2030-01-01" }, coachStaff, null)),
    ).rejects.toThrow(/row-level security/);
    expect(await t.asUser(parent, (tx) => loadAllStaffChecks(tx))).toEqual([]);
  });

  it("refuses an expiry before the issue date", async () => {
    await expect(
      t.asUser(admin, (tx) => saveStaffCheck(tx, coachStaff, { kind: "dbs", title: null, reference: null, issuedOn: "2027-01-01", expiresOn: "2026-01-01" }, adminStaff, null)),
    ).rejects.toThrow();
  });
});
