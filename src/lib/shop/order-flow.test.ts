import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { adminSteps, canMove, CLOSED_STATUSES, EMAIL_ON_MOVE, LIVE_STATUSES, movesInto, OPEN_STATUSES, ORDER_FLOW, ORDER_STATUSES, PAID_STATUSES, sqlList } from "./order-flow";

// The shop order's life in one place: these pin the shape, so a change to it is a decision, not a slip.

describe("the order flow", () => {
  it("only moves forward, and collected and cancelled are final", () => {
    const rank = (s: string) => ORDER_STATUSES.indexOf(s as never);
    for (const from of ORDER_STATUSES) for (const to of ORDER_FLOW[from]) expect(rank(to), `${from} → ${to}`).toBeGreaterThan(rank(from));
    expect(ORDER_FLOW.collected).toEqual([]);
    expect(ORDER_FLOW.cancelled).toEqual([]);
    // Once it's ready for the family it can't be cancelled from the list (a refund is handled by hand).
    expect(canMove("ready", "cancelled")).toBe(false);
  });

  it("every status but the first can be reached, and every one but the last two can be left", () => {
    for (const s of ORDER_STATUSES) {
      if (s !== "awaiting_payment") expect(movesInto(s).length, s).toBeGreaterThan(0);
      if (!(CLOSED_STATUSES as readonly string[]).includes(s)) expect(ORDER_FLOW[s].length, s).toBeGreaterThan(0);
    }
    expect(movesInto("awaiting_payment")).toEqual([]);
    expect(movesInto("paid")).toEqual(["awaiting_payment"]);
    expect(movesInto("cancelled")).toEqual(["awaiting_payment", "paid", "ordered"]);
  });

  it("the groups cover every status once", () => {
    expect([...OPEN_STATUSES, ...CLOSED_STATUSES].sort()).toEqual([...ORDER_STATUSES].sort());
    expect([...LIVE_STATUSES, "cancelled"].sort()).toEqual([...ORDER_STATUSES].sort());
    // Paid means the money is in: everything reachable from paid except cancelled.
    expect(PAID_STATUSES).toEqual(["paid", "ordered", "ready", "collected"]);
    expect(sqlList(PAID_STATUSES)).toBe("'paid', 'ordered', 'ready', 'collected'");
  });

  it("emails the parent only on a move that exists", () => {
    for (const to of Object.keys(EMAIL_ON_MOVE)) expect(movesInto(to as never).length, to).toBeGreaterThan(0);
  });
});

describe("the admin's buttons", () => {
  it("are exactly the allowed moves, each with a word", () => {
    for (const status of ORDER_STATUSES) {
      for (const payBy of ["card", "bank"] as const) {
        const steps = adminSteps({ status, payBy });
        expect(steps.map((s) => s.status)).toEqual(ORDER_FLOW[status]);
        for (const s of steps) expect(s.label, `${status} → ${s.status}`).not.toBe("");
        expect(steps.filter((s) => s.primary).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reads as it did before the moves had one home", () => {
    expect(adminSteps({ status: "awaiting_payment", payBy: "bank" })).toEqual([
      { status: "paid", label: "Transfer received", primary: true },
      { status: "cancelled", label: "Cancel" },
    ]);
    expect(adminSteps({ status: "awaiting_payment", payBy: "card" })).toEqual([
      { status: "paid", label: "Mark paid" },
      { status: "cancelled", label: "Cancel" },
    ]);
    expect(adminSteps({ status: "paid", payBy: "card" })).toEqual([
      { status: "ordered", label: "Ordered from supplier", primary: true },
      { status: "ready", label: "Ready for Friday" },
      { status: "cancelled", label: "Cancel" },
    ]);
    expect(adminSteps({ status: "ordered", payBy: "bank" })).toEqual([
      { status: "ready", label: "Ready for Friday", primary: true },
      { status: "cancelled", label: "Cancel" },
    ]);
    expect(adminSteps({ status: "ready", payBy: "bank" })).toEqual([{ status: "collected", label: "Handed over", primary: true }]);
    expect(adminSteps({ status: "collected", payBy: "bank" })).toEqual([]);
  });
});

describe("one home for the flow", () => {
  const SRC = join(__dirname, "..", "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith("order-flow.ts"));

  it("no other file spells out the paid statuses or its own table of moves", () => {
    const copies = files.filter((f) => {
      const s = readFileSync(f, "utf8");
      return /['"]paid['"],\s*['"]ordered['"],\s*['"]ready['"]/.test(s) || /awaiting_payment:\s*\[/.test(s);
    });
    expect(copies.map((f) => relative(SRC, f))).toEqual([]);
  });
});
