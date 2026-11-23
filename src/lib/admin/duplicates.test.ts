import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { NEEDS } from "./needs";

// "Maybe listed twice" (admin review, 23 Nov 2026): the same name in the club, or the same first name under a
// parent in common. Shown for an admin to check; nothing is merged.

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
});

const listed = () =>
  t.asUser(admin, (tx) => tx.query<{ first_name: string; last_name: string }>(`select p.first_name, p.last_name from players p where ${NEEDS.duplicate.where} order by 1, 2`));

const addChild = (first: string, last: string, parent?: string) =>
  t.asSystem(async (tx) => {
    const [p] = await tx.query<{ id: string }>(
      `insert into players (first_name, last_name, date_of_birth, age_group) values ($1, $2, '2019-03-01', 'U6') returning id`,
      [first, last],
    );
    if (parent) await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [p.id, parent]);
    return p.id;
  });

describe("children who may be listed twice", () => {
  it("lists nobody in the sample club", async () => {
    expect(await listed()).toEqual([]);
  });

  it("finds the same name under different parents, whatever the case or middle initial", async () => {
    await addChild("Yaqub", "Zakaria");
    await addChild("YAQUB", "zakaria");
    await addChild("Adam", "M Uddin");
    await addChild("Adam M", "Uddin");
    expect(await listed()).toEqual([
      { first_name: "Adam", last_name: "M Uddin" },
      { first_name: "Adam M", last_name: "Uddin" },
      { first_name: "YAQUB", last_name: "zakaria" },
      { first_name: "Yaqub", last_name: "Zakaria" },
    ]);
  });

  it("finds the same first name under a parent in common, even with a different surname", async () => {
    await addChild("Musa", "Ahmed-Khan", DEV_IDS.adnan);
    const names = (await listed()).map((r) => r.first_name);
    expect(names.filter((n) => n === "Musa").length).toBeGreaterThanOrEqual(1);
    // A different child of the same parent isn't listed.
    await addChild("Ibrahim", "Ahmed", DEV_IDS.adnan);
    expect((await listed()).map((r) => r.first_name)).not.toContain("Ibrahim");
  });
});
