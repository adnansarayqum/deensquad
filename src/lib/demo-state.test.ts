import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  decodeState,
  encodeState,
  withAvailability,
  withCheckIn,
  withPhotoConsent,
  withRead,
} from "./demo-state";

describe("demo state cookie", () => {
  it("round-trips through encode and decode", () => {
    const state = withPhotoConsent(withAvailability(withRead(EMPTY_STATE, "ann-away-kit"), "training-2026-10-09", "coming"), "no");
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it("falls back to an empty state for missing or malformed values", () => {
    expect(decodeState(undefined)).toEqual(EMPTY_STATE);
    expect(decodeState("not base64 json")).toEqual(EMPTY_STATE);
    expect(decodeState(Buffer.from('{"v":2}').toString("base64url"))).toEqual(EMPTY_STATE);
  });

  it("drops values it does not recognise", () => {
    const tampered = Buffer.from(
      JSON.stringify({ v: 1, read: ["a", 5], availability: { s1: "maybe", s2: "away" }, done: ["payment-plan", "hack"], photoConsent: "sure", checkedIn: [] }),
    ).toString("base64url");
    const state = decodeState(tampered);
    expect(state.read).toEqual([]);
    expect(state.availability).toEqual({ s2: "away" });
    expect(state.done).toEqual(["payment-plan"]);
    expect(state.photoConsent).toBeUndefined();
  });

  it("does not duplicate ids", () => {
    const once = withCheckIn(EMPTY_STATE, "p-zayd");
    expect(withCheckIn(once, "p-zayd").checkedIn).toEqual(["p-zayd"]);
    expect(withRead(withRead(EMPTY_STATE, "x"), "x").read).toEqual(["x"]);
  });

  it("marks the checklist item done when consent is given", () => {
    const state = withPhotoConsent(EMPTY_STATE, "yes");
    expect(state.done).toContain("photo-consent");
    expect(state.photoConsent).toBe("yes");
  });
});
