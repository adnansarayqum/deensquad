import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { nextFridaySession } from "../dates";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { buildExport } from "../exports/reports";
import { sessionFeePence, setSessionFeePence } from "../settings";
import { checkInByPass } from "../staff/checkin";
import { loadRegister } from "../staff/register";
import { passToken } from "../pass/token";
import { loadSessionPayments, takeGatePayment, undoGatePayment } from "./payments";

// A Friday: the sample club's training (6:30pm, every age group) is today. Yusuf has a monthly plan, Musa none.
const friday = new Date("2026-10-09T17:00:00Z");
const atGate = new Date("2026-10-09T17:25:00Z");
const saturday = new Date("2026-10-10T10:00:00Z");

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;
let coachId: string;
let session: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true, now: friday });
  coach = await t.signIn(DEV_EMAILS.coach);
  [{ id: coachId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.coach]));
  [{ id: session }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where starts_at = $1`, [nextFridaySession(friday).start]));
});

describe("session fee at the gate", () => {
  it("is offered for pay as you go and no plan, never a monthly plan, and taken once at the fee that day", async () => {
    await t.asSystem((tx) => tx.query(`insert into payment_status (player_id, state) values ($1, 'pay_as_you_go') on conflict (player_id) do update set state = 'pay_as_you_go'`, [DEV_IDS.musa]));
    const register = (group: string) => t.asUser(coach, (tx) => loadRegister(tx, { now: atGate, sessionId: session, group }));
    const u7 = (await register("U7"))!;
    const u10 = (await register("U10"))!;
    expect(u7.rows.find((r) => r.id === DEV_IDS.musa)).toMatchObject({ paysAtGate: true, paidPence: null });
    expect(u10.rows.find((r) => r.id === DEV_IDS.yusuf)).toMatchObject({ paysAtGate: false });

    expect(await t.asUser(coach, (tx) => sessionFeePence(tx))).toBe(700);
    expect(await t.asUser(coach, (tx) => takeGatePayment(tx, session, { playerId: DEV_IDS.musa }, coachId, atGate))).toEqual({});
    // A second tap keeps the first.
    expect(await t.asUser(coach, (tx) => takeGatePayment(tx, session, { playerId: DEV_IDS.musa }, coachId, atGate))).toEqual({});
    const taken = await t.asUser(coach, (tx) => loadSessionPayments(tx, session));
    expect(taken.total).toBe(700);
    expect(taken.count).toBe(1);
    expect((await register("U7"))!.rows.find((r) => r.id === DEV_IDS.musa)?.paidPence).toBe(700);

    // The spreadsheet lists it.
    const admin = await t.signIn(DEV_EMAILS.admin);
    const csv = await t.asUser(admin, (tx) => buildExport(tx, "gate-payments", atGate));
    expect(csv.rows).toHaveLength(1);
    expect(csv.rows[0]).toEqual(expect.arrayContaining(["Musa", "7.00", "Card", "Coach Hamza"]));

    // Undo, then a new fee set by an admin applies to the next payment.
    await t.asUser(coach, (tx) => undoGatePayment(tx, session, { playerId: DEV_IDS.musa }, atGate));
    const [{ id: adminId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
    await t.asUser(admin, (tx) => setSessionFeePence(tx, 750, adminId));
    await expect(t.asUser(coach, (tx) => setSessionFeePence(tx, 100, coachId))).rejects.toThrow();
    await t.asUser(coach, (tx) => takeGatePayment(tx, session, { playerId: DEV_IDS.musa }, coachId, atGate));
    expect((await t.asUser(coach, (tx) => loadSessionPayments(tx, session))).total).toBe(750);
  });

  it("only on the session's day, only by staff, and the scanner says who pays", async () => {
    expect((await t.asUser(coach, (tx) => takeGatePayment(tx, session, { playerId: DEV_IDS.musa }, coachId, saturday))).error).toMatch(/only be marked here on the day/);
    const parent = await t.signIn(DEV_EMAILS.parent);
    await expect(
      t.asUser(parent, (tx) => tx.query(`insert into session_payments (session_id, player_id, amount_pence) values ($1, $2, 1)`, [session, DEV_IDS.musa])),
    ).rejects.toThrow(/row-level security/);
    const scan = await t.asUser(coach, (tx) => checkInByPass(tx, passToken(DEV_IDS.musa), atGate));
    expect(scan.ok && scan.child).toMatchObject({ paysAtGate: true, paidPence: null, feePence: 700, session: { id: session } });
    await t.asUser(coach, (tx) => takeGatePayment(tx, session, { playerId: DEV_IDS.musa }, coachId, atGate));
    // Parents can see their own child's payments (for the data download), no one else's.
    const own = await t.asUser(parent, (tx) => tx.query(`select amount_pence from session_payments`));
    expect(own).toHaveLength(1);
    const other = await t.signIn("parent1@example.com");
    expect(await t.asUser(other, (tx) => tx.query(`select 1 from session_payments`))).toHaveLength(0);
  });
});

describe("the fee an admin types", () => {
  it("reads pounds, with or without pence or a £", async () => {
    const { parseFee } = await import("../settings");
    expect(parseFee("7")).toBe(700);
    expect(parseFee("£7.50")).toBe(750);
    expect(parseFee(" 7.5 ")).toBe(750);
    expect(parseFee("0")).toBeNull();
    expect(parseFee("seven")).toBeNull();
    expect(parseFee("101")).toBeNull();
  });
});
