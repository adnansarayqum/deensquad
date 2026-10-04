import { beforeEach, describe, expect, it } from "vitest";
import { DEV_EMAILS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";
import { parseRegistration, type Registration } from "./registration";
import { issueSignIn, verifyCode } from "./service";

let t: Awaited<ReturnType<typeof testDatabase>>;
const now = new Date("2026-10-05T18:00:00Z");

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
});

const form = (fields: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of fields) f.append(k, v);
  return f;
};

const family: Registration = {
  firstName: "Hana",
  lastName: "Rahman",
  phone: "07700 900555",
  children: [
    { firstName: "Ilyas", lastName: "Rahman", dateOfBirth: "2017-05-01", ageGroup: "U10" },
    { firstName: "Maryam", lastName: "Rahman", dateOfBirth: "2020-09-10", ageGroup: "U6" },
  ],
};

async function signUp(email: string, registration: Registration) {
  const issued = await t.asSystem((tx) => issueSignIn(tx, { email, ip: "1.2.3.4", now, purpose: "sign_in", registration }));
  if (!issued.ok) throw new Error(issued.reason);
  return t.asSystem((tx) => verifyCode(tx, issued.request.requestId, issued.request.code!, now));
}

describe("parent sign-up", () => {
  it("checks the form and skips empty extra child rows", () => {
    const ok = parseRegistration(
      form([
        ["firstName", "Hana"],
        ["lastName", "Rahman"],
        ["phone", "07700900555"],
        ["childFirstName", "Ilyas"],
        ["childLastName", ""],
        ["childDob", "2017-05-01"],
        ["childGroup", "U10"],
        ["childFirstName", ""],
        ["childLastName", ""],
        ["childDob", ""],
        ["childGroup", ""],
      ]),
      now,
    );
    expect(ok).toEqual({
      ok: true,
      registration: { firstName: "Hana", lastName: "Rahman", phone: "07700 900555", children: [{ firstName: "Ilyas", lastName: "Rahman", dateOfBirth: "2017-05-01", ageGroup: "U10" }] },
    });
    const noGroup = parseRegistration(form([["firstName", "Hana"], ["lastName", "R"], ["childFirstName", "Ilyas"], ["childDob", "2017-05-01"], ["childGroup", "U9"]]), now);
    expect(noGroup).toEqual({ ok: false, error: "Choose Ilyas's group." });
    expect(parseRegistration(form([["firstName", "Hana"], ["lastName", "R"]]), now)).toEqual({ ok: false, error: "Add your child's details." });
  });

  it("creates nothing until the emailed code is entered, then creates the family", async () => {
    const issued = await t.asSystem((tx) => issueSignIn(tx, { email: "hana@example.com", ip: null, now, purpose: "sign_in", registration: family }));
    expect(issued.ok).toBe(true);
    expect(await t.asSystem((tx) => tx.query(`select 1 from guardians where email = 'hana@example.com'`))).toHaveLength(0);

    const result = issued.ok ? await t.asSystem((tx) => verifyCode(tx, issued.request.requestId, issued.request.code!, now)) : null;
    expect(result).toMatchObject({ ok: true, registered: { parentName: "Hana Rahman" } });
    if (!result?.ok) return;
    expect(result.registered?.added.map((c) => c.firstName)).toEqual(["Ilyas", "Maryam"]);
    const kids = await t.asUser(result.userId, (tx) => tx.query<{ first_name: string; age_group: string }>(`select first_name, age_group::text from players order by first_name`));
    expect(kids).toEqual([
      { first_name: "Ilyas", age_group: "U10" },
      { first_name: "Maryam", age_group: "U6" },
    ]);
  });

  it("doesn't duplicate an existing family; it adds only new children", async () => {
    const result = await signUp(DEV_EMAILS.parent, {
      firstName: "Adnan",
      lastName: "Sample",
      phone: null,
      children: [
        { firstName: "Yusuf", lastName: "Sample", dateOfBirth: "2018-03-14", ageGroup: "U10" },
        { firstName: "Aisha", lastName: "Sample", dateOfBirth: "2021-01-01", ageGroup: "U6" },
      ],
    });
    expect(result.ok && result.registered?.added.map((c) => c.firstName)).toEqual(["Aisha"]);
    const [{ n }] = await t.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from guardians where lower(email) = $1`, [DEV_EMAILS.parent]));
    expect(n).toBe(1);
  });

  it("still keeps unknown emails out of plain sign-in", async () => {
    const result = await t.asSystem((tx) => issueSignIn(tx, { email: "stranger@example.com", ip: null, now, purpose: "sign_in" }));
    expect(result).toEqual({ ok: false, reason: "unknown" });
  });
});
