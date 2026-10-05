import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { passToken } from "../pass/token";
import { checkInByPass } from "./checkin";
import { loadRegister, summarise } from "./register";

// A Friday: the sample club's training (6:30pm, every age group) is today. Two U10s (Adam F. and Ilyas C.) said not coming.
const friday = new Date("2026-10-09T17:00:00Z");
const atGate = new Date("2026-10-09T17:25:00Z");

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true, now: friday });
  coach = await t.signIn(DEV_EMAILS.coach);
});

const register = (group: string, allowed?: ("U7" | "U10")[]) => t.asUser(coach, (tx) => loadRegister(tx, { now: atGate, group, allowed }));

describe("the gate register", () => {
  it("lists children who said not coming, and counts them once they turn up", async () => {
    const before = summarise((await register("U10"))!);
    expect(before.away.map((r) => r.firstName)).toEqual(["Adam", "Ilyas"]);
    expect(before.expectedTotal).toBe(14);

    const view = (await register("U10"))!;
    const adam = view.rows.find((r) => r.firstName === "Adam")!;
    await t.asUser(coach, (tx) =>
      tx.query(`insert into attendance (session_id, player_id, method, recorded_by) values ($1, $2, 'manual', auth.uid())`, [view.session.id, adam.id]),
    );

    const after = summarise((await register("U10"))!);
    expect(after.away.map((r) => r.firstName)).toEqual(["Ilyas"]);
    expect(after.here).toMatchObject([{ firstName: "Adam", method: "manual" }]);
    expect(after.expectedTotal).toBe(15);
  });

  it("puts pass check-ins in the here list, marked as scanned", async () => {
    await t.asUser(coach, (tx) => checkInByPass(tx, passToken(DEV_IDS.yusuf), atGate));
    const s = summarise((await register("U10"))!);
    expect(s.here).toMatchObject([{ id: DEV_IDS.yusuf, method: "qr" }]);
    expect(s.notHere.some((r) => r.id === DEV_IDS.yusuf)).toBe(false);
  });

  it("still keeps a group coach to their own groups", async () => {
    const view = (await register("U10", ["U7"]))!;
    expect(view.group).toBe("U7");
    expect(view.groups).toEqual(["U7"]);
    expect(view.rows.every((r) => r.method === null)).toBe(true);
    expect(view.rows.map((r) => r.firstName)).toContain("Musa");
    expect(view.rows.map((r) => r.firstName)).not.toContain("Yusuf");
  });
});
