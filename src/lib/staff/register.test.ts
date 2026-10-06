import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { passToken } from "../pass/token";
import { checkInByPass } from "./checkin";
import { flagSummary } from "./flags";
import { ALL_GROUPS, loadRegister, summarise } from "./register";

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

  it("opens a linked future session even when there is a session today", async () => {
    const [next] = await t.asUser(coach, (tx) =>
      tx.query<{ id: string }>(`select id from sessions where starts_at > $1 and cancelled_at is null order by starts_at limit 1`, [new Date("2026-10-10T00:00:00Z")]),
    );
    const linked = (await t.asUser(coach, (tx) => loadRegister(tx, { now: atGate, sessionId: next.id, group: "U10" })))!;
    expect(linked.session.id).toBe(next.id);
    // Without a link, today's session opens as before; an unknown id falls back to today's too.
    const plain = (await register("U10"))!;
    expect(plain.session.id).not.toBe(next.id);
    const unknown = (await t.asUser(coach, (tx) => loadRegister(tx, { now: atGate, sessionId: "00000000-0000-0000-0000-000000000000", group: "U10" })))!;
    expect(unknown.session.id).toBe(plain.session.id);
  });

  it("still keeps a group coach to their own groups", async () => {
    const view = (await register("U10", ["U7"]))!;
    expect(view.group).toBe("U7");
    expect(view.groups).toEqual(["U7"]);
    expect(view.rows.every((r) => r.method === null)).toBe(true);
    expect(view.rows.map((r) => r.firstName)).toContain("Musa");
    expect(view.rows.map((r) => r.firstName)).not.toContain("Yusuf");
  });

  it("lists every group of the session together on All groups, each child with their group", async () => {
    const view = (await register(ALL_GROUPS))!;
    expect(view.group).toBe(ALL_GROUPS);
    expect(view.groups).toEqual(["U7", "U10"]);
    const groupOf = new Map(view.rows.map((r) => [r.firstName, r.ageGroup]));
    expect(groupOf.get("Musa")).toBe("U7");
    expect(groupOf.get("Yusuf")).toBe("U10");
    // Sorted by first name across the groups.
    const names = view.rows.map((r) => `${r.firstName} ${r.lastInitial}`);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(summarise(view).expectedTotal).toBe(view.rows.length - 2);
  });

  it("offers All groups only with two or more groups: a coach of one group gets their group", async () => {
    const view = (await register(ALL_GROUPS, ["U7"]))!;
    expect(view.group).toBe("U7");
    expect(view.rows.every((r) => r.ageGroup === "U7")).toBe(true);
  });
});

describe("the needs-a-word summary", () => {
  it("counts children, and each flag once per child", () => {
    expect(flagSummary([{ flags: [] }])).toBeNull();
    expect(flagSummary([{ flags: ["kit_ready"] }, { flags: [] }])).toBe("1 child needs a word (1 kit ready)");
    expect(
      flagSummary([
        { flags: ["no_payment_plan", "unread_news"] },
        { flags: ["no_payment_plan"] },
        { flags: ["kit_ready"] },
        { flags: ["missing_consent"] },
      ]),
    ).toBe("4 children need a word (2 no payment plan, 1 no photo consent, 1 unread news, 1 kit ready)");
  });
});
