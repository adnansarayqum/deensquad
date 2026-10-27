// The TeamFeePay import: lenient headers, statuses in words, matching by name (and parent email when names clash or
// are spelt differently), and what each status does to the plan the app has.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { applyTeamFeePay, nextState, parseTeamFeePay, planTeamFeePay, readTfpStatus } from "./teamfeepay";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: new Date("2026-10-27T12:00:00Z") });
  admin = await t.signIn(DEV_EMAILS.admin);
});

describe("TeamFeePay statuses", () => {
  it("reads statuses in TeamFeePay's words", () => {
    expect(readTfpStatus("Active")).toBe("active");
    expect(readTfpStatus("Paid")).toBe("active");
    expect(readTfpStatus("Payment failed")).toBe("overdue");
    expect(readTfpStatus("In arrears")).toBe("overdue");
    expect(readTfpStatus("Inactive")).toBe("cancelled");
    expect(readTfpStatus("Cancelled")).toBe("cancelled");
    expect(readTfpStatus("Pending")).toBeNull();
    expect(readTfpStatus("")).toBeNull();
  });

  it("moves plans: active → monthly plan, overdue → overdue, cancelled → no plan except pay as you go", () => {
    expect(nextState("self_reported", "active")).toBe("active");
    expect(nextState("pay_as_you_go", "active")).toBe("active");
    expect(nextState("active", "overdue")).toBe("overdue");
    expect(nextState("active", "cancelled")).toBe("missing");
    expect(nextState("pay_as_you_go", "cancelled")).toBe("pay_as_you_go");
  });
});

describe("TeamFeePay files", () => {
  it("finds the columns whatever they're called, and says what's missing", () => {
    const a = parseTeamFeePay("Member Name,Payer Email,Subscription Status\nYusuf Sample,adnan@example.com,Active\n");
    expect(a.rows).toEqual([{ line: 2, firstName: "Yusuf", lastName: "Sample", email: "adnan@example.com", statusText: "Active", status: "active" }]);
    const b = parseTeamFeePay("First Name,Surname,Status\nMusa,Sample,Failed\n");
    expect(b.rows[0]).toMatchObject({ firstName: "Musa", lastName: "Sample", email: null, status: "overdue" });
    expect(parseTeamFeePay("Name,Email\nA,b@c.d\n").problem).toMatch(/Status column/);
    expect(parseTeamFeePay("Email,Status\nb@c.d,Active\n").problem).toMatch(/child's name/);
  });

  it("matches children, explains the rows it can't use, and applies only the changes", async () => {
    const [yusuf, musa] = await t.asSystem((tx) =>
      tx.query<{ first_name: string; last_name: string }>(`select first_name, last_name from players where id = any($1::uuid[]) order by array_position($1::uuid[], id)`, [[DEV_IDS.yusuf, DEV_IDS.musa]]),
    );
    const csv = [
      "Player,Parent email,Status",
      `${yusuf.first_name} ${yusuf.last_name},${DEV_EMAILS.parent},Active`,
      // Name spelt differently, found through the parent's email and first name.
      `${musa.first_name} ${musa.last_name}x,${DEV_EMAILS.parent},Payment failed`,
      "Nobody Here,someone@example.com,Active",
      `${yusuf.first_name} ${yusuf.last_name},${DEV_EMAILS.parent},Active`,
      "Someone Else,x@example.com,Pending",
    ].join("\n");
    const rows = parseTeamFeePay(csv).rows;
    const plan = await t.asUser(admin, (tx) => planTeamFeePay(tx, rows));
    const byChild = Object.fromEntries(plan.changes.map((c) => [c.playerId, c]));
    expect(byChild[DEV_IDS.musa]).toMatchObject({ to: "overdue", byEmail: true });
    expect(plan.changes.length + plan.unchanged).toBe(2);
    expect(plan.skipped.map((s) => s.reason)).toEqual(["No child with this name in the app", "Same child as row 2", 'Status "Pending" not recognised']);

    await t.asUser(admin, (tx) => applyTeamFeePay(tx, plan.changes, new Date("2026-10-27T12:00:00Z")));
    const states = await t.asSystem((tx) =>
      tx.query<{ player_id: string; state: string; synced: boolean }>(`select player_id, state::text, synced_at is not null as synced from payment_status where player_id = any($1::uuid[])`, [[DEV_IDS.yusuf, DEV_IDS.musa]]),
    );
    expect(Object.fromEntries(states.map((s) => [s.player_id, s.state]))).toEqual({ [DEV_IDS.yusuf]: "active", [DEV_IDS.musa]: "overdue" });
    // Running the same file again changes nothing.
    const again = await t.asUser(admin, (tx) => planTeamFeePay(tx, rows));
    expect(again.changes).toEqual([]);
  });
});
