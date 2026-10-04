// Demo mode keeps everything a parent or coach taps in one small cookie, so the app works
// on Vercel with no database while still behaving like the real thing for that browser.
// These functions are pure so they can be unit-tested and reused by the Server Actions.

import type { Availability, ChecklistItemId } from "./domain";

export const DEMO_COOKIE = "ds_demo";

export type DemoState = {
  v: 1;
  /** Announcement ids the parent has acknowledged. */
  read: string[];
  /** Session id -> the parent's answer. */
  availability: Record<string, Availability>;
  /** Checklist items the parent has completed in the app. */
  done: ChecklistItemId[];
  /** Photo consent answer, once given. */
  photoConsent?: "yes" | "no";
  /** Player ids a coach has marked as here at the gate. */
  checkedIn: string[];
};

export const EMPTY_STATE: DemoState = { v: 1, read: [], availability: {}, done: [], checkedIn: [] };

const CHECKLIST_IDS: ChecklistItemId[] = ["registered", "emergency-contacts", "kit-ordered", "payment-plan", "photo-consent"];
const MAX_LIST = 50;

function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function fromBase64Url(text: string): string {
  return Buffer.from(text, "base64url").toString("utf8");
}

export function encodeState(state: DemoState): string {
  return toBase64Url(JSON.stringify(state));
}

const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

/** Parse a cookie value. Anything malformed or tampered with falls back to an empty state. */
export function decodeState(raw: string | undefined | null): DemoState {
  if (!raw) return EMPTY_STATE;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (!parsed || typeof parsed !== "object") return EMPTY_STATE;
    const p = parsed as Record<string, unknown>;
    if (p.v !== 1) return EMPTY_STATE;

    const availability: Record<string, Availability> = {};
    if (p.availability && typeof p.availability === "object") {
      for (const [k, v] of Object.entries(p.availability as Record<string, unknown>)) {
        if (v === "coming" || v === "away") availability[k] = v;
      }
    }
    return {
      v: 1,
      read: isStringArray(p.read) ? p.read.slice(0, MAX_LIST) : [],
      availability,
      done: isStringArray(p.done) ? (p.done.filter((d) => (CHECKLIST_IDS as string[]).includes(d)) as ChecklistItemId[]) : [],
      photoConsent: p.photoConsent === "yes" || p.photoConsent === "no" ? p.photoConsent : undefined,
      checkedIn: isStringArray(p.checkedIn) ? p.checkedIn.slice(0, MAX_LIST) : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

const addUnique = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list : [...list, item]);

export function withRead(state: DemoState, announcementId: string): DemoState {
  return { ...state, read: addUnique(state.read, announcementId) };
}

export function withAvailability(state: DemoState, sessionId: string, answer: Availability): DemoState {
  return { ...state, availability: { ...state.availability, [sessionId]: answer } };
}

export function withDone(state: DemoState, item: ChecklistItemId): DemoState {
  return { ...state, done: addUnique(state.done, item) };
}

export function withPhotoConsent(state: DemoState, answer: "yes" | "no"): DemoState {
  return { ...withDone(state, "photo-consent"), photoConsent: answer };
}

export function withCheckIn(state: DemoState, playerId: string): DemoState {
  return { ...state, checkedIn: addUnique(state.checkedIn, playerId) };
}
