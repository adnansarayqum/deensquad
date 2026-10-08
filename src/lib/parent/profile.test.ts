// Parents editing their own details and their children's, and adding a child (migration 0021's functions), run as
// different signed-in people on PGlite with the sample club.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { addMyChild, checkDateOfBirth, haveChild, loadMyChild, loadMyDetails, updateMyChild, updateMyDetails } from "./profile";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf (U10) and Musa (U7)
let other: string; // parent of one U10 child, nobody else's
let otherChild: string;

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  other = await t.signIn("parent1@example.com");
  [{ id: otherChild }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `select p.id from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id where g.email = 'parent1@example.com'`,
    ),
  );
});

describe("checkDateOfBirth", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("accepts a real date between 3 and 18 years ago", () => {
    expect(checkDateOfBirth("2016-04-01", "Layla", now)).toEqual({ ok: true, dob: "2016-04-01" });
    expect(checkDateOfBirth("2023-10-01", "Layla", now)).toEqual({ ok: true, dob: "2023-10-01" });
  });
  it("names the child and the problem", () => {
    expect(checkDateOfBirth("", "Layla", now)).toEqual({ ok: false, error: "Add Layla's date of birth." });
    expect(checkDateOfBirth("2016-02-30", "Layla", now)).toEqual({ ok: false, error: "Add Layla's date of birth." });
    expect(checkDateOfBirth("2027-01-01", "Layla", now)).toEqual({ ok: false, error: "Layla's date of birth can't be in the future." });
    expect(checkDateOfBirth("2025-01-01", "Layla", now)).toEqual({ ok: false, error: "Check Layla's date of birth: it makes them 1." });
    expect(checkDateOfBirth("2005-01-01", "Layla", now)).toEqual({ ok: false, error: "Check Layla's date of birth: it makes them 21." });
  });
});

describe("a parent's own details", () => {
  it("updates name and mobile, never email, and stamps the change", async () => {
    await t.asUser(adnan, (tx) => updateMyDetails(tx, { firstName: "  Adnan  ", lastName: "Sarayqum", phone: "07700 900123" }));
    const me = await t.asUser(adnan, loadMyDetails);
    expect(me).toEqual({ firstName: "Adnan", lastName: "Sarayqum", phone: "07700 900123", email: DEV_EMAILS.parent });
    const [row] = await t.asSystem((tx) =>
      tx.query<{ updated: boolean }>(`select updated_by_parent_at is not null as updated from guardians where id = $1`, [DEV_IDS.adnan]),
    );
    expect(row.updated).toBe(true);
    // Nobody else's row moved.
    const [sara] = await t.asSystem((tx) => tx.query<{ last_name: string }>(`select last_name from guardians where id = $1`, [DEV_IDS.sara]));
    expect(sara.last_name).not.toBe("Sarayqum");
  });

  it("refuses an empty name and cuts a long one to 60 characters", async () => {
    await expect(t.asUser(adnan, (tx) => updateMyDetails(tx, { firstName: "   ", lastName: "X", phone: null }))).rejects.toThrow(/invalid name/);
    await t.asUser(adnan, (tx) => updateMyDetails(tx, { firstName: "A".repeat(80), lastName: "Sarayqum", phone: null }));
    const me = await t.asUser(adnan, loadMyDetails);
    expect(me?.firstName).toHaveLength(60);
    expect(me?.phone).toBeNull();
    await t.asUser(adnan, (tx) => updateMyDetails(tx, { firstName: "Adnan", lastName: "Sarayqum", phone: null }));
  });

  it("still can't write the guardians table directly", async () => {
    const rows = await t.asUser(adnan, (tx) => tx.query(`update guardians set email = 'x@example.com' where id = $1 returning id`, [DEV_IDS.adnan]));
    expect(rows).toHaveLength(0);
  });
});

describe("a parent's child", () => {
  it("updates the name and date of birth of their own child and nothing else", async () => {
    const before = await t.asSystem((tx) => tx.query<{ age_group: string; photo_consent: boolean | null }>(`select age_group::text, photo_consent from players where id = $1`, [DEV_IDS.musa]));
    await t.asUser(adnan, (tx) => updateMyChild(tx, { id: DEV_IDS.musa, firstName: "Musa", lastName: "Sarayqum", dateOfBirth: "2019-05-05" }));
    const musa = await t.asUser(adnan, (tx) => loadMyChild(tx, DEV_IDS.musa));
    expect(musa).toMatchObject({ firstName: "Musa", lastName: "Sarayqum", dateOfBirth: "2019-05-05", ageGroup: before[0].age_group });
    const after = await t.asSystem((tx) =>
      tx.query<{ age_group: string; photo_consent: boolean | null; updated: boolean }>(
        `select age_group::text, photo_consent, updated_by_parent_at is not null as updated from players where id = $1`,
        [DEV_IDS.musa],
      ),
    );
    expect(after[0]).toEqual({ ...before[0], updated: true });
  });

  it("refuses another family's child, even by id", async () => {
    expect(await t.asUser(adnan, (tx) => loadMyChild(tx, otherChild))).toBeNull();
    await expect(
      t.asUser(adnan, (tx) => updateMyChild(tx, { id: otherChild, firstName: "Taken", lastName: "Over", dateOfBirth: "2016-01-01" })),
    ).rejects.toThrow(/not allowed/);
    const [row] = await t.asSystem((tx) => tx.query<{ first_name: string }>(`select first_name from players where id = $1`, [otherChild]));
    expect(row.first_name).not.toBe("Taken");
  });

  it("refuses a date of birth that's in the future or outside 3 to 18", async () => {
    for (const dob of ["2040-01-01", "2025-06-01", "2000-01-01"]) {
      await expect(t.asUser(adnan, (tx) => updateMyChild(tx, { id: DEV_IDS.musa, firstName: "Musa", lastName: "S", dateOfBirth: dob }))).rejects.toThrow(
        /invalid date of birth/,
      );
    }
  });

  it("still can't write the players table directly", async () => {
    const rows = await t.asUser(adnan, (tx) => tx.query(`update players set age_group = 'U15' where id = $1 returning id`, [DEV_IDS.musa]));
    expect(rows).toHaveLength(0);
  });
});

describe("adding a child", () => {
  it("adds the child to the caller's account only, joined today, and the club's group list", async () => {
    const id = await t.asUser(adnan, (tx) => addMyChild(tx, { firstName: "Maryam", lastName: "Sarayqum", dateOfBirth: "2018-03-03", ageGroup: "Girls" }));
    const mine = await t.asUser(adnan, (tx) => tx.query<{ first_name: string }>(`select first_name from players where id in (select my_player_ids()) order by 1`));
    expect(mine.map((r) => r.first_name)).toEqual(["Maryam", "Musa", "Yusuf"]);
    const links = await t.asSystem((tx) => tx.query<{ guardian_id: string }>(`select guardian_id from player_guardians where player_id = $1`, [id]));
    expect(links.map((l) => l.guardian_id)).toEqual([DEV_IDS.adnan]);
    const [row] = await t.asSystem((tx) =>
      tx.query<{ age_group: string; joined_today: boolean; dob: string }>(
        `select age_group::text, joined_on = (now() at time zone 'Europe/London')::date as joined_today, date_of_birth::text as dob from players where id = $1`,
        [id],
      ),
    );
    expect(row).toEqual({ age_group: "Girls", joined_today: true, dob: "2018-03-03" });
    // Sara (the other parent) doesn't see Maryam until the club links her.
    const sara = await t.signIn(DEV_EMAILS.secondParent);
    const hers = await t.asUser(sara, (tx) => tx.query<{ first_name: string }>(`select first_name from players where id in (select my_player_ids())`));
    expect(hers.map((r) => r.first_name).sort()).toEqual(["Musa", "Yusuf"]);
  });

  it("refuses a child already on the account (same first name and date of birth, any case)", async () => {
    expect(await t.asUser(adnan, (tx) => haveChild(tx, "maryam", "2018-03-03"))).toBe(true);
    expect(await t.asUser(adnan, (tx) => haveChild(tx, "Maryam", "2018-03-04"))).toBe(false);
    await expect(
      t.asUser(adnan, (tx) => addMyChild(tx, { firstName: "MARYAM", lastName: "Sarayqum", dateOfBirth: "2018-03-03", ageGroup: "U7" })),
    ).rejects.toThrow(/duplicate child/);
  });

  it("refuses a group the club doesn't offer", async () => {
    await expect(
      t.asUser(adnan, (tx) => tx.query(`select add_my_child('Zayn', 'Sarayqum', '2016-01-01'::date, 'U9')`)),
    ).rejects.toThrow(/invalid group/);
    await expect(t.asUser(adnan, (tx) => tx.query(`select add_my_child('Zayn', 'Sarayqum', '2016-01-01'::date, 'U99')`))).rejects.toThrow();
  });

  it("another parent can't add a child to someone else's account: it lands on their own", async () => {
    const id = await t.asUser(other, (tx) => addMyChild(tx, { firstName: "Noor", lastName: "Example", dateOfBirth: "2017-07-07", ageGroup: "U10" }));
    const links = await t.asSystem((tx) =>
      tx.query<{ email: string }>(`select g.email from player_guardians pg join guardians g on g.id = pg.guardian_id where pg.player_id = $1`, [id]),
    );
    expect(links.map((l) => l.email)).toEqual(["parent1@example.com"]);
  });
});
