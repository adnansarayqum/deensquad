// A child's medical and additional needs (migration 0024), run as different signed-in people on PGlite with the
// sample club (Yusuf U10, Musa U7; Coach Hamza; an admin): the child's own parents write it, only with consent;
// they, the admins and the coaches of the child's group read it; a coach of another group sees nothing, not even
// the register's marker; staff never write it.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { buildFamilyExport } from "../parent/export";
import { buildChecklist, countSteps } from "../parent/views";
import { loadChecklistFacts, loadFamily } from "../parent/data";
import { loadRegister } from "../staff/register";
import { clearMyChildMedical, loadMedicalForStaff, loadMyChildMedical, medicalMarkerSql, myChildrenWithMedical, setMyChildMedical, type MedicalText } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf (U10) and Musa (U7)
let sara: string; // their other parent
let other: string; // parent of one U10 child
let coach: string; // Coach Hamza
let admin: string;

const text = (over: Partial<MedicalText> = {}): MedicalText => ({ conditions: "Autism", allergies: null, medication: null, howToHelp: "Give him a moment", ...over });
const coachGroups = (groups: string[]) =>
  t.asSystem((tx) => tx.query(`update staff set age_groups = $1::text[]::age_group[] where email = $2`, [groups, DEV_EMAILS.coach]));
const marker = (user: string, child: string) =>
  t.asUser(user, async (tx) => (await tx.query<{ m: boolean }>(`select ${medicalMarkerSql("p")} as m from players p where p.id = $1`, [child]))[0].m);
const raw = (user: string) => t.asUser(user, (tx) => tx.query<{ player_id: string }>(`select player_id from player_medical order by player_id`));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  other = await t.signIn("parent1@example.com");
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
});

beforeEach(async () => {
  await t.asSystem((tx) => tx.query(`delete from player_medical`));
  await coachGroups([]);
});

describe("a parent saving their child's medical information", () => {
  it("saves it for their own child with consent, trimmed, and their co-parent reads it", async () => {
    await t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text({ conditions: "  ADHD  ", allergies: "  " }), true));
    const saved = await t.asUser(sara, (tx) => loadMyChildMedical(tx, DEV_IDS.musa));
    expect(saved).toMatchObject({ conditions: "ADHD", allergies: null, medication: null, howToHelp: "Give him a moment" });
    expect(saved?.consentAt).toBeTruthy();
    const [row] = await t.asSystem((tx) => tx.query<{ updated_by: string }>(`select updated_by from player_medical`));
    expect(row.updated_by).toBe(DEV_IDS.adnan);
  });

  it("is refused without consent, for someone else's child, and for staff", async () => {
    await expect(t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text(), false))).rejects.toThrow(/consent needed/);
    await expect(t.asUser(other, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text(), true))).rejects.toThrow(/not allowed/);
    await expect(t.asUser(admin, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text(), true))).rejects.toThrow(/not allowed/);
    await expect(t.asUser(other, (tx) => clearMyChildMedical(tx, DEV_IDS.musa))).rejects.toThrow(/not allowed/);
    expect(await raw(admin)).toEqual([]);
  });

  it("refuses a field over 500 characters", async () => {
    await expect(t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text({ allergies: "x".repeat(501) }), true))).rejects.toThrow(/too long/);
  });

  it("with every field blank, removes it (no consent needed to take it away); Remove does the same", async () => {
    await t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text(), true));
    await t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.musa, { conditions: " ", allergies: null, medication: "", howToHelp: null }, false));
    expect(await t.asUser(adnan, (tx) => loadMyChildMedical(tx, DEV_IDS.musa))).toBeNull();
    await t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.yusuf, text(), true));
    await t.asUser(sara, (tx) => clearMyChildMedical(tx, DEV_IDS.yusuf));
    expect(await raw(admin)).toEqual([]);
  });

  it("can't be written directly by anyone, staff included (the parents own it)", async () => {
    for (const someone of [adnan, admin]) {
      await expect(
        t.asUser(someone, (tx) => tx.query(`insert into player_medical (player_id, conditions, consent_at) values ($1, 'x', now())`, [DEV_IDS.musa])),
      ).rejects.toThrow(/permission denied/);
    }
    await t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text(), true));
    await expect(t.asUser(admin, (tx) => tx.query(`update player_medical set conditions = 'y'`))).rejects.toThrow(/permission denied/);
    await expect(t.asUser(admin, (tx) => tx.query(`delete from player_medical`))).rejects.toThrow(/permission denied/);
  });

  it("goes when the child is removed", async () => {
    const [{ id }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group) values ('Temp', 'Child', 'U7') returning id`),
    );
    await t.asSystem((tx) => tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [id, DEV_IDS.adnan]));
    await t.asUser(adnan, (tx) => setMyChildMedical(tx, id, text(), true));
    await t.asSystem((tx) => tx.query(`delete from players where id = $1`, [id]));
    expect(await raw(admin)).toEqual([]);
  });
});

describe("who reads it", () => {
  beforeEach(async () => {
    await t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text(), true)); // U7
    await t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.yusuf, text({ conditions: "Asthma" }), true)); // U10
  });

  it("another parent: nothing", async () => {
    expect(await raw(other)).toEqual([]);
    expect(await t.asUser(other, (tx) => loadMyChildMedical(tx, DEV_IDS.musa))).toBeNull();
  });

  it("a U7 coach: Musa's (U7), not Yusuf's (U10), not even the register's marker", async () => {
    await coachGroups(["U7"]);
    expect(await raw(coach)).toEqual([{ player_id: DEV_IDS.musa }]);
    expect(await t.asUser(coach, (tx) => loadMedicalForStaff(tx, DEV_IDS.musa))).toMatchObject({ conditions: "Autism" });
    expect(await t.asUser(coach, (tx) => loadMedicalForStaff(tx, DEV_IDS.yusuf))).toBeNull();
    expect(await marker(coach, DEV_IDS.musa)).toBe(true);
    expect(await marker(coach, DEV_IDS.yusuf)).toBe(false);
  });

  it("a coach of every group (none ticked) and an admin: both", async () => {
    expect(await raw(coach)).toHaveLength(2);
    await coachGroups(["U10"]);
    expect(await raw(coach)).toEqual([{ player_id: DEV_IDS.yusuf }]);
    // An admin sees every child, whatever groups were once ticked for them.
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U7}' where email = $1`, [DEV_EMAILS.admin]));
    expect(await raw(admin)).toHaveLength(2);
    expect(await marker(admin, DEV_IDS.yusuf)).toBe(true);
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{}' where email = $1`, [DEV_EMAILS.admin]));
  });

  it("the register marks only children with some, for staff allowed to read it", async () => {
    await coachGroups(["U10"]);
    const view = await t.asUser(admin, (tx) => loadRegister(tx, { now: new Date(), group: "U7" }));
    expect(view?.group).toBe("U7");
    expect(view!.rows.find((r) => r.id === DEV_IDS.musa)?.medical).toBe(true);
    expect(view!.rows.filter((r) => r.id !== DEV_IDS.musa).every((r) => !r.medical)).toBe(true);  });
});

describe("on the parent's side", () => {
  it("is an optional To-do line that never counts as a step, and is in the data download", async () => {
    const family = (await t.asUser(adnan, loadFamily))!;
    const ids = family.children.map((c) => c.id);
    const before = await t.asUser(adnan, (tx) => loadChecklistFacts(tx, ids));
    const musa = family.children.find((c) => c.id === DEV_IDS.musa)!;
    const line = buildChecklist(musa, before).find((i) => i.id === "medical")!;
    expect(line).toMatchObject({ optional: true, done: false, title: "Medical and additional needs (optional)", href: `/player/child/${DEV_IDS.musa}/medical?from=/checklist` });
    const steps = countSteps(buildChecklist(musa, before));

    await t.asUser(adnan, (tx) => setMyChildMedical(tx, DEV_IDS.musa, text(), true));
    const after = await t.asUser(adnan, (tx) => loadChecklistFacts(tx, ids));
    expect(after.medical).toEqual(new Set([DEV_IDS.musa]));
    expect(buildChecklist(musa, after).find((i) => i.id === "medical")?.done).toBe(true);
    expect(countSteps(buildChecklist(musa, after))).toEqual(steps);
    expect(await t.asUser(other, (tx) => myChildrenWithMedical(tx, ids))).toEqual(new Set());

    const data = await t.asUser(adnan, (tx) => buildFamilyExport(tx, new Date()));
    expect(data.children.find((c) => c.firstName === "Musa")?.medicalAndAdditionalNeeds).toMatchObject({ conditions: "Autism", howTheCoachesCanHelp: "Give him a moment" });
    expect(data.children.find((c) => c.firstName === "Yusuf")?.medicalAndAdditionalNeeds).toBeNull();
  });
});
