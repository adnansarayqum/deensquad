import { describe, expect, it } from "vitest";
import type { ScanResult } from "../staff/checkin";
import { CLOSED, SAME_CODE_MS, SETTLE_MS, cameraOn, givenUp, step, wantsCode, type ScannerEvent, type ScannerState } from "./machine";

const child = { ok: true, child: { id: "c1", firstName: "Musa" } } as unknown as ScanResult;
const run = (events: ScannerEvent[], from: ScannerState = CLOSED) => events.reduce(step, from);
const looking = run([{ type: "open" }, { type: "cameraReady" }]);

describe("the gate scanner's states", () => {
  it("opens, reads a code, checks it and shows the child", () => {
    expect(run([{ type: "open" }]).phase).toBe("starting");
    expect(looking.phase).toBe("looking");
    const checking = step(looking, { type: "code", token: "DSP.A", at: 10_000 });
    expect(checking).toMatchObject({ phase: "checking", token: "DSP.A" });
    const shown = step(checking, { type: "answer", result: child, at: 10_400 });
    expect(shown).toMatchObject({ phase: "result", result: child, settledAt: 10_400 });
  });

  it("never shows a child's card while another code is being checked", () => {
    const shown = run([{ type: "code", token: "DSP.A", at: 10_000 }, { type: "answer", result: child, at: 10_400 }], looking);
    const next = step(shown, { type: "code", token: "DSP.B", at: 10_400 + SETTLE_MS });
    expect(next.phase).toBe("checking");
    expect("result" in next).toBe(false);
  });

  it("reads a code held up to the camera once, and again only after the pause", () => {
    const shown = run([{ type: "code", token: "DSP.A", at: 10_000 }, { type: "answer", result: child, at: 10_400 }], looking);
    expect(step(shown, { type: "code", token: "DSP.A", at: 10_000 + SAME_CODE_MS - 1 })).toBe(shown);
    expect(step(shown, { type: "code", token: "DSP.A", at: 10_000 + SAME_CODE_MS }).phase).toBe("checking");
  });

  it("reads nothing new while a check is in flight or just after an answer", () => {
    const checking = step(looking, { type: "code", token: "DSP.A", at: 10_000 });
    expect(step(checking, { type: "code", token: "DSP.B", at: 10_100 })).toBe(checking);
    const shown = step(checking, { type: "answer", result: child, at: 10_400 });
    expect(wantsCode(shown, 10_400 + SETTLE_MS - 1)).toBe(false);
    expect(step(shown, { type: "code", token: "DSP.B", at: 10_400 + SETTLE_MS - 1 })).toBe(shown);
    expect(wantsCode(shown, 10_400 + SETTLE_MS)).toBe(true);
  });

  it("keeps the code when there's no answer, and Try again checks the same one", () => {
    const lost = run([{ type: "code", token: "DSP.A", at: 10_000 }, { type: "noAnswer", at: 20_000 }], looking);
    expect(lost).toMatchObject({ phase: "noSignal", token: "DSP.A" });
    expect(step(lost, { type: "retry", at: 21_000 })).toMatchObject({ phase: "checking", token: "DSP.A" });
    // The next family's code is read too, without tapping anything.
    expect(step(lost, { type: "code", token: "DSP.B", at: 20_000 + SETTLE_MS })).toMatchObject({ phase: "checking", token: "DSP.B" });
  });

  it("stops at signed out: no more codes are read until the scanner is closed", () => {
    const out = run([{ type: "code", token: "DSP.A", at: 10_000 }, { type: "signedOut" }], looking);
    expect(out.phase).toBe("signedOut");
    expect(step(out, { type: "code", token: "DSP.B", at: 99_000 })).toBe(out);
    expect(step(out, { type: "stalled" })).toBe(out);
    expect(step(out, { type: "close" }).phase).toBe("closed");
  });

  it("says so when the reader goes quiet, restarts it, and gives up after the second time", () => {
    const stalled = step(looking, { type: "stalled" });
    expect(stalled).toMatchObject({ phase: "stalled", stalls: 1 });
    expect(stalled.run).toBe(looking.run + 1);
    expect(givenUp(stalled)).toBe(false);
    // Still quiet: it tries again, and counts it.
    expect(step(stalled, { type: "stalled" })).toMatchObject({ phase: "stalled", stalls: 2, run: stalled.run + 1 });
    const back = step(stalled, { type: "reading" });
    expect(back.phase).toBe("looking");
    const again = step(back, { type: "stalled" });
    expect(givenUp(again)).toBe(true);
    // A check in flight is waiting on the server, not a stalled reader.
    const checking = step(looking, { type: "code", token: "DSP.A", at: 10_000 });
    expect(step(checking, { type: "stalled" })).toBe(checking);
  });

  it("says why when the camera or the reader can't start, with the camera off", () => {
    const blocked = run([{ type: "open" }, { type: "cameraFailed", why: "camera" }]);
    expect(blocked).toMatchObject({ phase: "blocked", why: "camera" });
    expect(cameraOn(blocked)).toBe(false);
    expect(cameraOn(looking)).toBe(true);
    expect(cameraOn(CLOSED)).toBe(false);
  });

  it("forgets everything on close, and ignores an answer that arrives afterwards", () => {
    const checking = step(looking, { type: "code", token: "DSP.A", at: 10_000 });
    const closed = step(checking, { type: "close" });
    expect(closed).toMatchObject({ phase: "closed", last: null, stalls: 0 });
    expect(step(closed, { type: "answer", result: child, at: 10_400 })).toBe(closed);
    // Opening again starts the reader afresh.
    expect(step(closed, { type: "open" }).run).toBe(closed.run + 1);
  });

  it("every event from every state gives a state, never a crash", () => {
    const events: ScannerEvent[] = [
      { type: "open" }, { type: "close" }, { type: "cameraReady" }, { type: "cameraFailed", why: "reader" },
      { type: "code", token: "DSP.Z", at: 50_000 }, { type: "answer", result: child, at: 50_000 }, { type: "noAnswer", at: 50_000 },
      { type: "signedOut" }, { type: "retry", at: 50_000 }, { type: "stalled" }, { type: "reading" },
    ];
    let states: ScannerState[] = [CLOSED];
    for (let depth = 0; depth < 4; depth++) states = states.flatMap((s) => events.map((e) => step(s, e)));
    const phases = new Set(states.map((s) => s.phase));
    expect([...phases].sort()).toEqual(["blocked", "checking", "closed", "looking", "noSignal", "result", "signedOut", "stalled", "starting"]);
  });
});
