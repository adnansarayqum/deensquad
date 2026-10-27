import { describe, expect, it } from "vitest";
import { addDaysIso, checkName, checkState, clearance, expiryText, londonIsoDay, readDay, type StaffCheck } from "./checks";

const TODAY = "2026-10-27";
const check = (over: Partial<StaffCheck>): StaffCheck => ({ id: "c", staffId: "s", kind: "dbs", title: null, reference: null, issuedOn: null, expiresOn: null, ...over });

describe("staff checks", () => {
  it("says a check is up to date, running out within 60 days, or run out", () => {
    expect(checkState(check({ expiresOn: null }), TODAY)).toBe("ok");
    expect(checkState(check({ expiresOn: addDaysIso(TODAY, 61) }), TODAY)).toBe("ok");
    expect(checkState(check({ expiresOn: addDaysIso(TODAY, 60) }), TODAY)).toBe("due");
    expect(checkState(check({ expiresOn: TODAY }), TODAY)).toBe("due");
    expect(checkState(check({ expiresOn: "2026-10-26" }), TODAY)).toBe("expired");
  });

  it("sums up a person: no DBS, DBS run out, something running out, or up to date", () => {
    expect(clearance([], TODAY)).toMatchObject({ state: "missing", words: "No DBS check" });
    expect(clearance([check({ kind: "first_aid" })], TODAY)).toMatchObject({ state: "missing" });
    expect(clearance([check({ expiresOn: "2026-01-01" })], TODAY)).toMatchObject({ state: "expired", words: "DBS ran out" });
    expect(clearance([check({}), check({ id: "f", kind: "first_aid", expiresOn: "2026-11-30" })], TODAY)).toMatchObject({ state: "due", words: "First aid runs out soon" });
    expect(clearance([check({ expiresOn: "2029-10-01" })], TODAY)).toMatchObject({ state: "ok", words: "Checks up to date" });
    // A renewed DBS beside the old one that ran out: cleared, but the old one still shows as run out until removed.
    expect(clearance([check({ expiresOn: "2026-01-01" }), check({ id: "new", expiresOn: "2029-01-01" })], TODAY).state).toBe("expired");
  });

  it("names checks and their dates in words", () => {
    expect(checkName(check({}))).toBe("DBS check");
    expect(checkName(check({ kind: "coaching", title: "FA Playmaker" }))).toBe("Coaching qualification: FA Playmaker");
    expect(checkName(check({ kind: "other", title: "Mental health first aid" }))).toBe("Mental health first aid");
    expect(expiryText(check({ expiresOn: "2027-03-12" }), TODAY)).toBe("Runs out 12 Mar 2027");
    expect(expiryText(check({ expiresOn: "2026-01-02" }), TODAY)).toBe("Ran out 2 Jan 2026");
    expect(expiryText(check({}), TODAY)).toBe("No expiry date");
  });

  it("reads dates from the form and refuses impossible ones", () => {
    expect(readDay("")).toEqual({ ok: true, day: null });
    expect(readDay("2027-02-28")).toEqual({ ok: true, day: "2027-02-28" });
    expect(readDay("2027-02-30")).toEqual({ ok: false });
    expect(readDay("27/02/2027")).toEqual({ ok: false });
    expect(readDay("1900-01-01")).toEqual({ ok: false });
  });

  it("uses the London day", () => {
    expect(londonIsoDay(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
});
