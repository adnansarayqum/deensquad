import { describe, expect, it } from "vitest";
import { DEV_EMAILS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";
import { csvCell, toCsv } from "./csv";
import { EXPORTS, buildExport, seasonStart, type ExportKind } from "./reports";

describe("spreadsheet downloads", () => {
  it("quotes cells and defuses formulas", () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(toCsv(["a"], [[1]])).toBe('﻿"a"\r\n"1"\r\n');
  });

  it("starts the season on 1 August", () => {
    expect(seasonStart(new Date("2026-10-05T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(seasonStart(new Date("2027-03-01T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("builds every download for an admin, with one row per child in the families sheet", async () => {
    const now = new Date();
    const t = await testDatabase({ seed: true, now });
    const admin = await t.signIn(DEV_EMAILS.admin);
    for (const kind of Object.keys(EXPORTS) as ExportKind[]) {
      const { header, rows } = await t.asUser(admin, (tx) => buildExport(tx, kind, now));
      expect(rows.every((r) => r.length === header.length)).toBe(true);
    }
    const families = await t.asUser(admin, (tx) => buildExport(tx, "families", now));
    const [{ n }] = await t.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from players`));
    expect(families.rows).toHaveLength(n);
    const yusuf = families.rows.find((r) => r[0] === "Yusuf");
    expect(yusuf?.[5]).toBe("Adnan Sample; Sara Sample");
  });
});
