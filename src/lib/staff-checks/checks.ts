// Staff checks (migration 0035): the pure part. What each kind is called, how a check's dates read, and whether a
// member of staff is cleared to coach. DBS is the one every coach and admin needs; the rest are recorded when the
// club has them (safeguarding, first aid, coaching badges).

export const CHECK_KINDS = {
  dbs: "DBS check",
  safeguarding: "Safeguarding course",
  first_aid: "First aid",
  coaching: "Coaching qualification",
  other: "Other",
} as const;
export type CheckKind = keyof typeof CHECK_KINDS;
export const isCheckKind = (v: unknown): v is CheckKind => typeof v === "string" && v in CHECK_KINDS;

/** Checks every member of staff needs. */
export const REQUIRED_KINDS: CheckKind[] = ["dbs"];
/** "Runs out soon" this many days before the expiry date: time to book a renewal. */
export const DUE_SOON_DAYS = 60;

export type StaffCheck = {
  id: string;
  staffId: string;
  kind: CheckKind;
  title: string | null;
  reference: string | null;
  issuedOn: string | null; // yyyy-mm-dd
  expiresOn: string | null; // yyyy-mm-dd
};

export type CheckState = "ok" | "due" | "expired";

/** Today in London as yyyy-mm-dd (dates compare as strings). */
export const londonIsoDay = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);

export function addDaysIso(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function checkState(c: Pick<StaffCheck, "expiresOn">, today: string): CheckState {
  if (!c.expiresOn) return "ok";
  if (c.expiresOn < today) return "expired";
  return c.expiresOn <= addDaysIso(today, DUE_SOON_DAYS) ? "due" : "ok";
}

/** "12 Mar 2027" */
export function dayText(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/** The check's name: the kind, with its title when it has one ("Coaching qualification: FA Playmaker"). */
export const checkName = (c: Pick<StaffCheck, "kind" | "title">) => (c.title ? (c.kind === "other" ? c.title : `${CHECK_KINDS[c.kind]}: ${c.title}`) : CHECK_KINDS[c.kind]);

/** The dates in words: "Runs out 12 Mar 2027", "Ran out 2 Jan 2026", "No expiry date". */
export function expiryText(c: Pick<StaffCheck, "expiresOn">, today: string): string {
  if (!c.expiresOn) return "No expiry date";
  return c.expiresOn < today ? `Ran out ${dayText(c.expiresOn)}` : `Runs out ${dayText(c.expiresOn)}`;
}

export type StaffClearance = {
  /** "ok": every required check there and none run out. */
  state: "ok" | "due" | "expired" | "missing";
  /** Short words for the pill and the overview: "No DBS recorded" (nothing in the app, which isn't the same as no check), "DBS ran out", "First aid runs out soon". */
  words: string;
  missing: CheckKind[];
  expired: StaffCheck[];
  due: StaffCheck[];
};

/** One member of staff's checks summed up. Missing or run-out checks come before ones running out soon. */
export function clearance(checks: StaffCheck[], today: string): StaffClearance {
  const missing = REQUIRED_KINDS.filter((k) => !checks.some((c) => c.kind === k && checkState(c, today) !== "expired"));
  const expired = checks.filter((c) => checkState(c, today) === "expired");
  const due = checks.filter((c) => checkState(c, today) === "due");
  // A required kind that's only there as an expired check counts as run out, not missing.
  const reallyMissing = missing.filter((k) => !expired.some((c) => c.kind === k));
  const short = (c: StaffCheck) => (c.kind === "dbs" ? "DBS" : checkName(c));
  if (reallyMissing.length) return { state: "missing", words: `No ${reallyMissing.map((k) => (k === "dbs" ? "DBS" : CHECK_KINDS[k].toLowerCase())).join(" or ")} recorded`, missing: reallyMissing, expired, due };
  if (expired.length) return { state: "expired", words: `${short(expired[0])} ran out${expired.length > 1 ? ` (+${expired.length - 1} more)` : ""}`, missing: [], expired, due };
  if (due.length) return { state: "due", words: `${short(due[0])} runs out soon${due.length > 1 ? ` (+${due.length - 1} more)` : ""}`, missing: [], expired, due };
  return { state: "ok", words: "Checks up to date", missing: [], expired, due };
}

/** A date from a form: yyyy-mm-dd, a real day, between 1990 and 2100; blank is null; anything else is an error. */
export function readDay(value: FormDataEntryValue | null): { ok: true; day: string | null } | { ok: false } {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return { ok: true, day: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false };
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { ok: false };
  const year = Number(v.slice(0, 4));
  return year >= 1990 && year <= 2100 ? { ok: true, day: v } : { ok: false };
}
