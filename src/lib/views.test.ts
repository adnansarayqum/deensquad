import { describe, expect, it } from "vitest";
import { EMPTY_STATE, withAvailability, withCheckIn, withDone, withRead } from "./demo-state";
import { buildParentView, buildRegisterView, knownIds } from "./views";

const now = new Date("2026-10-04T17:00:00Z");

describe("parent view", () => {
  it("starts with the kit message unread and two checklist steps to go", () => {
    const view = buildParentView(now, EMPTY_STATE);
    expect(view.unreadCount).toBe(1);
    expect(view.news[0]).toMatchObject({ id: "ann-away-kit", read: false });
    expect(view.checklist.doneCount).toBe(3);
    expect(view.checklist.items.slice(0, 2).map((i) => i.done)).toEqual([false, false]);
    expect(view.friday.answer).toBeUndefined();
    expect(view.friday.session.startsAt).toBe("2026-10-09T17:30:00.000Z");
  });

  it("reflects a parent's taps", () => {
    const fridayId = buildParentView(now, EMPTY_STATE).friday.session.id;
    let state = withRead(EMPTY_STATE, "ann-away-kit");
    state = withAvailability(state, fridayId, "coming");
    state = withDone(state, "payment-plan");
    const view = buildParentView(now, state);
    expect(view.unreadCount).toBe(0);
    expect(view.friday.answer).toBe("coming");
    expect(view.friday.counts).toEqual({ coming: 17, away: 3, unanswered: 5 });
    expect(view.checklist.doneCount).toBe(4);
  });
});

describe("coach register", () => {
  it("counts who is here and flags missing payment plans", () => {
    const view = buildRegisterView(EMPTY_STATE);
    expect(view.expectedTotal).toBe(17);
    expect(view.hereCount).toBe(15);
    expect(view.flagged.map((r) => r.firstName)).toEqual(["Ahmed"]);
    expect(view.notHere.map((r) => r.firstName)).toEqual(["Ibrahim", "Zayd"]);
  });

  it("moves a player across when the coach marks them here", () => {
    const view = buildRegisterView(withCheckIn(EMPTY_STATE, "p-zayd"));
    expect(view.hereCount).toBe(16);
    expect(view.notHere.map((r) => r.firstName)).toEqual(["Ibrahim"]);
  });
});

describe("knownIds", () => {
  it("only accepts ids that exist in the demo data", () => {
    const ids = knownIds(now);
    expect(ids.announcements.has("ann-away-kit")).toBe(true);
    expect(ids.announcements.has("anything-else")).toBe(false);
    expect(ids.players.has("p-zayd")).toBe(true);
  });
});
