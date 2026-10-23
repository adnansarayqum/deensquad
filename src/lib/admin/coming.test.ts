import { describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { loadDashboard } from "./dashboard";
import { loadWhoIsComing } from "./coming";
import { nextSessionSummary } from "./overview";

// Who's coming (/admin/coming) lists, by name, the same children the overview's "N of M coming" counts.
const OCTOBER = new Date("2026-10-05T09:00:00Z");

describe("who's coming", () => {
  it("names the children behind the overview's figure, with each family's answer and reason", async () => {
    const t = await testDatabase({ seed: true, now: OCTOBER });
    const admin = await t.signIn(DEV_EMAILS.admin);
    const before = await t.asUser(admin, (tx) => loadWhoIsComing(tx, OCTOBER, null));
    expect(before).not.toBeNull();
    // Yusuf's family says yes, Musa's says no with a reason.
    for (const [player, answer, reason] of [
      [DEV_IDS.yusuf, "coming", null],
      [DEV_IDS.musa, "away", "Grandma's birthday"],
    ] as const) {
      const session = before!.sessions.find((s) => s.groups.includes(before!.children.find((c) => c.id === player)!.group))!;
      await t.asSystem((tx) =>
        tx.query(
          `insert into availability (session_id, player_id, answer, away_reason) values ($1, $2, $3, $4)
           on conflict (session_id, player_id) do update set answer = excluded.answer, away_reason = excluded.away_reason`,
          [session.id, player, answer, reason],
        ),
      );
    }
    const data = (await t.asUser(admin, (tx) => loadWhoIsComing(tx, OCTOBER, null)))!;
    const yusuf = data.children.find((c) => c.id === DEV_IDS.yusuf)!;
    const musa = data.children.find((c) => c.id === DEV_IDS.musa)!;
    expect([yusuf.answer, yusuf.reason]).toEqual(["coming", null]);
    expect([musa.answer, musa.reason]).toEqual(["away", "Grandma's birthday"]);

    // The same numbers as the overview's tile and Needs you row.
    const summary = nextSessionSummary(await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: false })), OCTOBER)!;
    const count = (a: string) => data.children.filter((c) => c.answer === a).length;
    expect([count("coming"), count("away"), count("none"), data.children.length]).toEqual([summary.coming, summary.away, summary.unanswered, summary.squad]);
  });

  it("shows a group coach only their groups' children", async () => {
    const t = await testDatabase({ seed: true, now: OCTOBER });
    const admin = await t.signIn(DEV_EMAILS.admin);
    const data = (await t.asUser(admin, (tx) => loadWhoIsComing(tx, OCTOBER, ["U7"])))!;
    expect(data.groups).toEqual(["U7"]);
    expect(new Set(data.children.map((c) => c.group))).toEqual(new Set(["U7"]));
  });

  it("is empty with nothing coming up", async () => {
    const t = await testDatabase({ seed: true, now: OCTOBER });
    const admin = await t.signIn(DEV_EMAILS.admin);
    expect(await t.asUser(admin, (tx) => loadWhoIsComing(tx, new Date("2031-01-01T00:00:00Z"), null))).toBeNull();
  });
});
