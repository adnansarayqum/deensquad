import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { nextFridaySession } from "../dates";
import { DEV_EMAILS } from "../db/dev-seed";
import { loadSessionPayments, takeGatePayment } from "../gate/payments";
import { anonymiseOldTrials, bookTrial, dueFollowUps, loadSessionTrials, loadTrialSessions, markFollowUpSent, setTrialArrived } from "./data";

// Monday before the sample club's Friday training (every group).
const monday = new Date("2026-10-05T12:00:00Z");
const friday = nextFridaySession(monday);
const atGate = new Date(friday.start.getTime() - 10 * 60_000);

let t: Awaited<ReturnType<typeof testDatabase>>;
let session: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true, now: monday });
  [{ id: session }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where starts_at = $1`, [friday.start]));
});

const booking = (over: Partial<Parameters<typeof bookTrial>[1]> = {}) => ({
  sessionId: session,
  parentFirstName: "Amina",
  parentLastName: "Trial",
  email: "amina.trial@example.com",
  phone: "07700 900123",
  childFirstName: "Idris",
  childLastName: "Trial",
  dateOfBirth: "2017-03-04",
  ageGroup: "U10" as const,
  ...over,
});

describe("trial sessions", () => {
  it("are booked once per child, for a session of their group, and never a tournament squad", async () => {
    const sessions = await t.asSystem((tx) => loadTrialSessions(tx, monday));
    expect(sessions.some((s) => s.id === session)).toBe(true);
    expect(sessions.some((s) => s.title === "Autumn Cup")).toBe(true);
    // A squad session (picked children only) isn't offered.
    const [{ id: cup }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where title = 'Autumn Cup'`));
    const [{ id: child }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where age_group = 'U10' limit 1`));
    await t.asSystem((tx) => tx.query(`insert into session_squads (session_id, player_id) values ($1, $2)`, [cup, child]));
    expect((await t.asSystem((tx) => loadTrialSessions(tx, monday))).some((s) => s.id === cup)).toBe(false);

    const ok = await t.asSystem((tx) => bookTrial(tx, booking(), monday));
    expect(ok.ok).toBe(true);
    expect(await t.asSystem((tx) => bookTrial(tx, booking({ email: "AMINA.trial@example.com", childFirstName: "idris" }), monday))).toEqual({ ok: false, reason: "already" });
    expect(await t.asSystem((tx) => bookTrial(tx, booking({ childFirstName: "Sami", sessionId: cup }), monday))).toEqual({ ok: false, reason: "session" });
    // Girls isn't in the Friday session's groups in the sample club.
    const girls = await t.asSystem((tx) => bookTrial(tx, booking({ childFirstName: "Hafsa", ageGroup: "Girls" }), monday));
    expect(girls).toEqual({ ok: false, reason: "group" });
  });

  it("show on the register; arrived and paid only on the day; then a follow-up; old ones anonymised", async () => {
    const booked = await t.asSystem((tx) => bookTrial(tx, booking(), monday));
    if (!booked.ok) throw new Error("not booked");
    const coach = await t.signIn(DEV_EMAILS.coach);
    const [{ id: coachId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.coach]));
    expect((await t.asUser(coach, (tx) => loadSessionTrials(tx, session, ["U10"]))).map((r) => r.childName)).toEqual(["Idris Trial"]);
    expect(await t.asUser(coach, (tx) => loadSessionTrials(tx, session, ["U7"]))).toEqual([]);
    // Parents can't read bookings.
    const parent = await t.signIn(DEV_EMAILS.parent);
    expect(await t.asUser(parent, (tx) => tx.query(`select id from trial_bookings`))).toHaveLength(0);

    expect((await t.asUser(coach, (tx) => setTrialArrived(tx, session, booked.id, true, monday))).error).toMatch(/Opens on/);
    expect(await t.asUser(coach, (tx) => setTrialArrived(tx, session, booked.id, true, atGate))).toEqual({});
    expect(await t.asUser(coach, (tx) => takeGatePayment(tx, session, { trialId: booked.id }, coachId, atGate))).toEqual({});
    expect((await t.asUser(coach, (tx) => loadSessionPayments(tx, session))).trials.get(booked.id)?.amountPence).toBe(700);
    expect((await t.asUser(coach, (tx) => loadSessionTrials(tx, session, ["U10"])))[0]).toMatchObject({ paidPence: 700 });

    // Not until an hour after the session; then once.
    expect(await t.asSystem((tx) => dueFollowUps(tx, new Date(friday.end.getTime() + 30 * 60_000)))).toHaveLength(0);
    const later = new Date(friday.end.getTime() + 2 * 3600_000);
    const due = await t.asSystem((tx) => dueFollowUps(tx, later));
    expect(due.map((d) => d.child_first_name)).toEqual(["Idris"]);
    await t.asSystem((tx) => markFollowUpSent(tx, [booked.id]));
    expect(await t.asSystem((tx) => dueFollowUps(tx, later))).toHaveLength(0);

    // 181 days on, the personal details go and the takings stay.
    const muchLater = new Date(friday.start.getTime() + 181 * 86400_000);
    expect(await t.asSystem((tx) => anonymiseOldTrials(tx, muchLater))).toBe(1);
    const [row] = await t.asSystem((tx) => tx.query<{ email: string; phone: string | null; child_first_name: string }>(`select email, phone, child_first_name from trial_bookings`));
    expect(row).toMatchObject({ phone: null, child_first_name: "Trial" });
    expect(row.email).toMatch(/^removed\+/);
    expect(await t.asSystem((tx) => anonymiseOldTrials(tx, muchLater))).toBe(0);
    expect(await t.asSystem((tx) => tx.query(`select 1 from session_payments`))).toHaveLength(1);
  });
});
