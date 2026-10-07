import { describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import { parseCsv } from "./csv";
import { ageOnCutOff, applyImport, groupForAge, parseAgeGroup, parseDate, planImport } from "./import";

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
    expect(parseAgeGroup("Under 9s")).toBe("U10");
    expect(parseAgeGroup("u11")).toBe("U12");
    expect(parseAgeGroup("U10")).toBe("U10");
    expect(parseAgeGroup("U6")).toBe("U6");
    expect(parseAgeGroup("U16")).toBeNull();
  });

  it("reads a cell naming girls as the Girls group, even with an age, but not the mixed U6", () => {
    for (const cell of ["Girls", "girls", "girl", "Girls team", "Girls U10", "U12 Girls", "GIRLS"]) expect(parseAgeGroup(cell), cell).toBe("Girls");
    expect(parseAgeGroup("U6 (boys and girls)")).toBe("U6");
    expect(parseAgeGroup("Girlsxyz")).toBeNull();
  });

  it("never places a child in Girls by age", () => {
    for (let age = 0; age <= 30; age++) expect(groupForAge(age), `age ${age}`).not.toBe("Girls");
  });

  it("keeps a girl of any age in Girls without an age check, and never puts a child there by date of birth", () => {
    const plan = planImport(
      [
        "Child first name,Child last name,Date of birth,Age group,Parent first name,Parent email",
        "Maryam,Ali,14/03/2018,Girls,Hina,hina@example.com",
        "Safa,Ali,01/05/2011,Girls U10,Hina,hina@example.com",
        "Noor,Ali,,girls team,Hina,hina@example.com",
        "Aisha,Iqbal,14/03/2018,,Ruksana,ruksana@example.com",
        "Huda,Iqbal,14/03/2018,Year 4 netball,Ruksana,ruksana@example.com",
      ].join("\n"),
      now,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => [r.child.firstName, r.child.ageGroup])).toEqual([
      ["Maryam", "Girls"],
      ["Safa", "Girls"], // 15 by date of birth, but the sheet names girls
      ["Noor", "Girls"],
      ["Aisha", "U10"], // by date of birth: an age group, never Girls
      ["Huda", "U10"],
    ]);
    // Only the two placed by date of birth are listed to check; no Girls row is.
    expect(plan.checks.map((c) => c.line)).toEqual([5, 6]);
  });

  it("groups siblings by parent email and links a second parent", () => {
    const plan = planImport(
      [
        "Child name,Age group,Parent name,Email,Phone,Parent 2 name,Parent 2 email",
        "Ali Khan,U10,Sana Khan,SANA@example.com,07700 900111,Omar Khan,omar@example.com",
        "Zara Khan,U7,Sana Khan,sana@example.com,,,",
        "No Email,U10,Someone,,,,",
        "Bad Group,U19,Pat,pat@example.com,,,",
      ].join("\n"),
      now,
    );
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0].parents.map((p) => p.email)).toEqual(["sana@example.com", "omar@example.com"]);
    expect(plan.rows[0].parents[0].phone).toBe("07700 900111");
    expect(plan.errors.map((e) => e.line)).toEqual([4, 5]);
  });

  it("works out football age on 31 August and the group that covers it", () => {
    // The 2026/27 season (from 1 August 2026): ages on 31 August 2026.
    expect(ageOnCutOff("2018-03-14", now)).toBe(8);
    expect(ageOnCutOff("2018-08-31", now)).toBe(8);
    expect(ageOnCutOff("2018-09-01", now)).toBe(7);
    expect(ageOnCutOff("2018-03-14", new Date("2026-07-31T12:00:00Z"))).toBe(7); // still the 2025/26 season
    expect([3, 4, 6, 7, 8, 10, 11, 12, 13, 15, 16].map(groupForAge)).toEqual([null, "U6", "U6", "U7", "U10", "U10", "U12", "U12", "U15", "U15", null]);
  });

  it("places a child by date of birth when the group is missing or unreadable, and flags a group that doesn't match", () => {
    const plan = planImport(
      [
        "Child first name,Child last name,Date of birth,Age group,Parent first name,Parent email",
        "Aisha,Iqbal,14/03/2018,Year 4,Ruksana,ruksana@example.com",
        "Ilyas,Iqbal,02/06/2019,,Ruksana,ruksana@example.com",
        "Ali,Khan,14/03/2018,U15,Sana,sana@example.com",
        "Omar,Khan,14/03/2018,U10,Sana,sana@example.com",
        "Baby,Khan,01/01/2024,,Sana,sana@example.com",
        "Nodate,Khan,,Year 4,Sana,sana@example.com",
      ].join("\n"),
      now,
    );
    expect(plan.rows.map((r) => [r.child.firstName, r.child.ageGroup])).toEqual([
      ["Aisha", "U10"],
      ["Ilyas", "U7"],
      ["Ali", "U15"], // the sheet's group is kept
      ["Omar", "U10"],
    ]);
    expect(plan.checks).toEqual([
      { line: 2, message: 'Aisha was put in U10 by date of birth ("Year 4" isn\'t an age group).' },
      { line: 3, message: "Ilyas was put in U7 by date of birth (no age group given)." },
      { line: 4, message: "Ali is 8 by date of birth but listed in U15. Check before importing." },
    ]);
    expect(plan.errors).toEqual([
      { line: 6, message: "The age group is missing, and Baby is 2 by date of birth, outside the club's groups." },
      { line: 7, message: `"Year 4" isn't one of the app's groups (U6, U7, U10, U12, U15, Girls).` },
    ]);
  });

  it("flags a group only when it fits neither the child's age on 31 August nor a year up", () => {
    // [date of birth, age on 31 August 2026, listed group, flagged?]
    const cases: [string, number, string, boolean][] = [
      ["02/06/2020", 6, "U7", false], // Musa in the sample club: "under 7 on 31 August"
      ["02/06/2020", 6, "U6", false],
      ["02/06/2020", 6, "U10", true],
      ["01/10/2020", 5, "U7", true], // 5 or 6 both mean U6
      ["01/05/2019", 7, "U10", false], // a year up is 8: U10
      ["01/05/2016", 10, "U12", false],
      ["01/05/2016", 10, "U15", true],
      ["01/05/2014", 12, "U15", false],
      ["01/05/2011", 15, "U15", false],
      ["01/05/2018", 8, "U7", true],
    ];
    const csv = ["Child first name,Child last name,Date of birth,Age group,Parent first name,Parent email"];
    cases.forEach(([dob, , group], i) => csv.push(`Kid${i},Test,${dob},${group},Pat,pat${i}@example.com`));
    const plan = planImport(csv.join("\n"), now);
    expect(plan.errors).toEqual([]);
    cases.forEach(([dob, age, group, flagged], i) => {
      const check = plan.checks.find((c) => c.line === i + 2);
      expect(ageOnCutOff(plan.rows[i].child.dateOfBirth!, now), dob).toBe(age);
      expect(Boolean(check), `${age} in ${group}`).toBe(flagged);
      if (check) expect(check.message).toBe(`Kid${i} is ${age} by date of birth but listed in ${group}. Check before importing.`);
    });
  });

  it("takes a sheet with dates of birth and no age group column", () => {
    const plan = planImport("Child name,DOB,Parent name,Email\nAisha Iqbal,14/03/2018,Ruksana Iqbal,ruksana@example.com", now);
    expect(plan.errors).toEqual([]);
    expect(plan.rows[0].child.ageGroup).toBe("U10");
  });

  it("flags repeated rows and possible duplicate children", () => {
    const plan = planImport(
      [
        "Child first name,Child last name,Date of birth,Age group,Parent first name,Parent email,Parent phone",
        "Zakariya,Khan,01/05/2016,U10,Sana,sana@example.com,+44 7700 900000",
        "Maryam,Patel,15/10/2017,U10,Hina,hina@example.com,",
        "Zakariya,Khan,01/05/2016,U10,Sana,sana@example.com,+44 7700 900000",
        "MARYAM,PATEL,15/10/2017,U10,Hina,HINA@example.com,",
        "Aisha,Iqbal,14/03/2018,U10,Ruksana,ruksana@gmail.com,",
        "Aisha,Iqbal,14/03/2018,U10,Ruksana,ruksana@googlemail.com,",
        "Zakariya,Ahmed,,U10,Sana,sana@example.com,",
      ].join("\n"),
      now,
    );
    expect(plan.rows).toHaveLength(7);
    expect(plan.rows[0].parents[0].phone).toBe("07700 900000");
    expect(plan.checks).toEqual([
      { line: 4, message: "Repeats row 2 (Zakariya Khan), so the two are merged into one child." },
      { line: 5, message: "Repeats row 3 (MARYAM PATEL), so the two are merged into one child." },
      { line: 7, message: "Possible duplicate: Aisha Iqbal is also on row 6 with the same date of birth, under a different parent email." },
      { line: 8, message: "Possible duplicate: Zakariya Ahmed and Zakariya Khan (row 2) are in the same family." },
    ]);
  });

  it("says which required columns are missing", () => {
    const plan = planImport("Name,Team\nAli,U10", now);
    expect(plan.errors[0].message).toMatch(/parent email/);
  });
});

describe("applying an import", () => {
  it("creates families once and updates them on a second import", async () => {
    const t = await testDatabase({ seed: true, now });
    const admin = await t.signIn(DEV_EMAILS.admin);
    const csv = [
      "Child first name,Child last name,Age group,Shirt number,Parent first name,Parent email,Parent 2 first name,Parent 2 email",
      "Ali,Khan,U10,4,Sana,sana@example.com,Omar,omar@example.com",
      "Zara,Khan,U7,,Sana,sana@example.com,,",
      "Yusuf,Sample,U12,,Adnan,adnan@example.com,,",
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

  it("counts rows that repeat another row in the sheet apart from children already in the app", async () => {
    const t = await testDatabase({ seed: true, now });
    const admin = await t.signIn(DEV_EMAILS.admin);
    const csv = [
      "Child first name,Child last name,Date of birth,Age group,Parent first name,Parent email",
      "Zakariya,Khan,01/05/2016,U10,Sana,sana@example.com",
      "Zakariya,Khan,01/05/2016,U10,Sana,sana@example.com",
      "MARYAM,PATEL,15/10/2017,U10,Hina,hina@example.com",
      "Maryam,Patel,15/10/2017,U10,Hina,hina@example.com",
      // The sample club's Yusuf under a different parent email: imported, but flagged.
      "Yusuf,Sample,14/03/2018,U10,Adnan,adnan.sample@example.com",
    ].join("\n");
    const summary = await t.asUser(admin, (tx) => applyImport(tx, planImport(csv, now)));
    expect(summary).toMatchObject({ childrenAdded: 3, childrenUpdated: 0, rowsRepeated: 2 });
    expect(summary.possibleDuplicates).toEqual([
      { line: 6, message: "Possible duplicate: Yusuf Sample is already in the app with the same date of birth, under another parent." },
    ]);
  });

  it("is refused for a parent", async () => {
    const t = await testDatabase({ seed: true, now });
    const parent = await t.signIn(DEV_EMAILS.parent);
    const plan = planImport("Child name,Age group,Parent name,Email\nNew Kid,U10,X Y,x@example.com", now);
    await expect(t.asUser(parent, (tx) => applyImport(tx, plan))).rejects.toThrow(/row-level security/);
  });
});
