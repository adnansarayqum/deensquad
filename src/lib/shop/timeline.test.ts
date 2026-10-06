import { describe, expect, it } from "vitest";
import { orderTimeline } from "./timeline";

const base = { createdAt: "2026-10-01T10:00:00Z", paidAt: null, readyAt: null, collectedAt: null };

describe("order timeline", () => {
  it("shows placed, paid, ready and collected, each dated once done", () => {
    expect(orderTimeline({ ...base, status: "awaiting_payment" })).toEqual([
      { label: "Placed", done: true, at: base.createdAt },
      { label: "Not paid yet", done: false, at: null },
      { label: "Ready to collect", done: false, at: null },
      { label: "Collected", done: false, at: null },
    ]);
    const ready = orderTimeline({ ...base, status: "ready", paidAt: "2026-10-02T10:00:00Z", readyAt: "2026-10-06T10:00:00Z" });
    expect(ready.map((s) => [s.label, s.done, s.at])).toEqual([
      ["Placed", true, base.createdAt],
      ["Paid", true, "2026-10-02T10:00:00Z"],
      ["Ready to collect", true, "2026-10-06T10:00:00Z"],
      ["Collected", false, null],
    ]);
    // Ordered from the supplier still reads as paid, not yet ready.
    expect(orderTimeline({ ...base, status: "ordered", paidAt: "2026-10-02T10:00:00Z" })[2]).toEqual({ label: "Ready to collect", done: false, at: null });
    expect(orderTimeline({ ...base, status: "collected", paidAt: "2026-10-02T10:00:00Z", collectedAt: "2026-10-09T18:00:00Z" }).every((s) => s.done)).toBe(true);
  });

  it("ends a cancelled order at Cancelled", () => {
    expect(orderTimeline({ ...base, status: "cancelled" }).map((s) => s.label)).toEqual(["Placed", "Cancelled"]);
    expect(orderTimeline({ ...base, status: "cancelled", paidAt: "2026-10-02T10:00:00Z" }).map((s) => s.label)).toEqual(["Placed", "Paid", "Cancelled"]);
  });
});
