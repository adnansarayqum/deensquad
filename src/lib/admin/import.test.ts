import { describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import { parseCsv } from "./csv";
import { applyImport, parseAgeGroup, parseDate, planImport } from "./import";

const now = new Date("2026-10-05T12:00:00Z");

describe("csv", () => {
  it("handles quotes, commas, line breaks and a byte-order mark", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "two\nlines", "3"],
    ]);
  });
});

describe("planning an import", () => {
  it("reads UK dates and age groups written different ways", () => {
    expect(parseDate("14/03/2018", now)).toBe("2018-03-14");
    expect(parseDate("31/02/2018", now)).toBeNull();
    expect(parseAgeGroup("Under 9s")).toBe("U9");
    expect(parseAgeGroup("u11")).toBe("U11");
    expect(parseAgeGroup("U10")).toBeNull();
  });

  it("groups siblings by parent email and links a second parent", () => {
    const plan = planImport(
      [
        "Child name,Age group,Parent name,Email,Phone,Parent 2 name,Parent 2 email",
        "Ali Khan,U9,Sana Khan,SANA@example.com,07700 900111,Omar Khan,omar@example.com",
        "Zara Khan,U7,Sana Khan,sana@example.com,,,",
        "No Email,U9,Someone,,,,",
        "Bad Group,U10,Pat,pat@example.com,,,",
      ].join("\n"),
      now,
    );
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0].parents.map((p) => p.email)).toEqual(["sana@example.com", "omar@example.com"]);
    expect(plan.rows[0].parents[0].phone).toBe("07700 900111");
    expect(plan.errors.map((e) => e.line)).toEqual([4, 5]);
  });

  it("says which required columns are missing", () => {
    const plan = planImport("Name,Team\nAli,U9", now);
    expect(plan.errors[0].message).toMatch(/parent email/);
  });
});

describe("applying an import", () => {
  it("creates families once and updates them on a second import", async () => {
    const t = await testDatabase({ seed: true, now });
    const admin = await t.signIn(DEV_EMAILS.admin);
    const csv = [
      "Child first name,Child last name,Age group,Shirt number,Parent first name,Parent email,Parent 2 first name,Parent 2 email",
      "Ali,Khan,U9,4,Sana,sana@example.com,Omar,omar@example.com",
      "Zara,Khan,U7,,Sana,sana@example.com,,",
      "Yusuf,Sample,U11,,Adnan,adnan@example.com,,",
    ].join("\n");
    const first = await t.asUser(admin, (tx) => applyImport(tx, planImport(csv, now)));
    expect(first).toMatchObject({ childrenAdded: 2, childrenUpdated: 1, parentsAdded: 2, parentsUpdated: 1 });

    const again = await t.asUser(admin, (tx) => applyImport(tx, planImport(csv, now)));
    expect(again).toMatchObject({ childrenAdded: 0, childrenUpdated: 3, parentsAdded: 0 });

    const omar = await t.signIn("omar@example.com");
    const kids = await t.asUser(omar, (tx) => tx.query<{ first_name: string }>("select first_name from players order by first_name"));
    expect(kids.map((k) => k.first_name)).toEqual(["Ali"]);
    const sana = await t.signIn("sana@example.com");
    expect(await t.asUser(sana, (tx) => tx.query("select 1 from players"))).toHaveLength(2);
  });

  it("is refused for a parent", async () => {
    const t = await testDatabase({ seed: true, now });
    const parent = await t.signIn(DEV_EMAILS.parent);
    const plan = planImport("Child name,Age group,Parent name,Email\nNew Kid,U9,X Y,x@example.com", now);
    await expect(t.asUser(parent, (tx) => applyImport(tx, plan))).rejects.toThrow(/row-level security/);
  });
});
