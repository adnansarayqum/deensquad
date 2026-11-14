import type { ScanResult } from "../staff/checkin";

// The gate scanner's states, in one place (the rebuild plan, 14 Nov 2026). The first scanner kept these as five
// separate switches (open, error, result, checking, busy) that had to be kept in step by hand; here the screen shows
// exactly one state, and every move between states is in `step`, which is plain data in and out, so it's tested
// without a camera or a server (machine.test.ts). The component does only what a state asks for.
//
//   closed → starting → looking ⇄ checking → result | noSignal | signedOut
//                    ↘ blocked        looking/result/noSignal → stalled → looking
//
// Rules the first scanner got wrong at some point, now part of the machine:
// - a child's card is never on screen while another code is being checked (checking holds no result);
// - a code held up to the camera is read once, not again for SAME_CODE_MS;
// - after an answer, nothing new is read for SETTLE_MS, so the coach sees the card;
// - a reader that goes quiet is a state the coach can see (stalled), not a camera that looks fine and reads nothing.

/** The same code is ignored for this long after it was read (a phone held up at the gate). */
export const SAME_CODE_MS = 6000;
/** After an answer, nothing new is read for this long. */
export const SETTLE_MS = 1500;
/** No picture read for this long while the camera is on means the reader has stopped. */
export const STALL_MS = 2000;
/** After this many stalls in one opening, the screen stops promising a restart and points to Mark here. */
export const STALLS_BEFORE_GIVING_UP = 2;

export type Blocked = "camera" | "reader";

export type ScannerState = (
  | { phase: "closed" }
  | { phase: "starting" }
  | { phase: "blocked"; why: Blocked }
  | { phase: "looking" }
  | { phase: "stalled" }
  | { phase: "checking"; token: string }
  | { phase: "result"; result: ScanResult }
  | { phase: "noSignal"; token: string }
  | { phase: "signedOut" }
) & {
  /** The last code read and when, to ignore the same one held up. */
  last: { token: string; at: number } | null;
  /** When the last answer (or no answer) came back. */
  settledAt: number;
  /** How many times the reader has stalled since the scanner was opened. */
  stalls: number;
  /** Goes up each time the reader should be started again: the component restarts its loop when it changes. */
  run: number;
};

export type ScannerEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "cameraReady" }
  | { type: "cameraFailed"; why: Blocked }
  | { type: "code"; token: string; at: number }
  | { type: "answer"; result: ScanResult; at: number }
  | { type: "noAnswer"; at: number }
  | { type: "signedOut" }
  | { type: "retry"; at: number }
  | { type: "stalled" }
  | { type: "reading" };

export const CLOSED: ScannerState = { phase: "closed", last: null, settledAt: 0, stalls: 0, run: 0 };

/** Phases in which the camera is on and a code may be read. */
const READS: ReadonlySet<ScannerState["phase"]> = new Set(["looking", "result", "noSignal"]);

/** True while the camera should be running. */
export function cameraOn(state: ScannerState): boolean {
  return state.phase !== "closed" && state.phase !== "blocked";
}

/** True when a code read now would be acted on (used by the reader to skip the work of decoding). */
export function wantsCode(state: ScannerState, now: number): boolean {
  return READS.has(state.phase) && now - state.settledAt >= SETTLE_MS;
}

export function step(state: ScannerState, event: ScannerEvent): ScannerState {
  const keep = { last: state.last, settledAt: state.settledAt, stalls: state.stalls, run: state.run };
  switch (event.type) {
    case "open":
      return state.phase === "closed" ? { ...CLOSED, phase: "starting", run: state.run + 1 } : state;
    case "close":
      return { ...CLOSED, run: state.run };
    case "cameraReady":
      return state.phase === "starting" ? { ...keep, phase: "looking" } : state;
    case "cameraFailed":
      return state.phase === "closed" ? state : { ...keep, phase: "blocked", why: event.why };
    case "code": {
      if (!wantsCode(state, event.at)) return state;
      if (state.last && state.last.token === event.token && event.at - state.last.at < SAME_CODE_MS) return state;
      return { ...keep, phase: "checking", token: event.token, last: { token: event.token, at: event.at } };
    }
    case "answer":
      return state.phase === "checking" ? { ...keep, phase: "result", result: event.result, settledAt: event.at } : state;
    case "noAnswer":
      return state.phase === "checking" ? { ...keep, phase: "noSignal", token: state.token, settledAt: event.at } : state;
    case "signedOut":
      return state.phase === "checking" ? { ...keep, phase: "signedOut" } : state;
    case "retry":
      return state.phase === "noSignal" ? { ...keep, phase: "checking", token: state.token, last: { token: state.token, at: event.at } } : state;
    case "stalled":
      // Only while it should be reading: a check in flight, a blocked camera or a signed-out coach isn't a stall.
      // While it stays stalled, each further report is another attempt to start it again.
      return READS.has(state.phase) || state.phase === "stalled" ? { ...keep, phase: "stalled", stalls: state.stalls + 1, run: state.run + 1 } : state;
    case "reading":
      return state.phase === "stalled" ? { ...keep, phase: "looking" } : state;
  }
}

/** True once the reader has stalled so often that the screen should point to Mark here. */
export function givenUp(state: ScannerState): boolean {
  return state.phase === "stalled" && state.stalls >= STALLS_BEFORE_GIVING_UP;
}
