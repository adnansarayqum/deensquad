// The Deen Squad domain model shared by the screens, the data layer and the admin.

// The club's groups: U6 (boys and girls), U7, U10 (ages 8–10), U12 (11–12), U15 (13–15), and Girls (girls of
// any age; migration 0018). A child is in exactly one group. Girls has no age: anything that works from a
// group's number (placing by age, age checks) uses NUMBERED_GROUPS, and copy uses groupPlural, not `${g}s`.
export const AGE_GROUPS = ["U6", "U7", "U10", "U12", "U15", "Girls"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const GIRLS = "Girls" satisfies AgeGroup;

/** The groups named by an age ("U10" = up to 10), youngest first. Never Girls. */
export const NUMBERED_GROUPS = AGE_GROUPS.filter((g): g is Exclude<AgeGroup, typeof GIRLS> => g !== GIRLS);

export function isAgeGroup(value: unknown): value is AgeGroup {
  return typeof value === "string" && (AGE_GROUPS as readonly string[]).includes(value);
}

/**
 * The groups ticked when the Add sessions form opens: the staff member's numbered groups, because Girls trains
 * separately. A coach of Girls alone still gets Girls.
 */
export function defaultSessionGroups(mine: readonly AgeGroup[]): AgeGroup[] {
  const numbered = mine.filter((g) => g !== GIRLS);
  return numbered.length > 0 ? numbered : [...mine];
}

/** A group's children, in copy: "U10s", but "Girls" (not "Girlss"). */
export function groupPlural(group: string): string {
  return group === GIRLS ? GIRLS : `${group}s`;
}

/** A list of groups in copy, as before ("U10, U12s"), ending "Girls" when it ends with Girls. */
export function groupsPlural(groups: readonly string[]): string {
  if (groups.length === 0) return "";
  return [...groups.slice(0, -1), groupPlural(groups[groups.length - 1])].join(", ");
}

/** A child at the club, as their parent sees them. */
export type Child = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  ageGroup: AgeGroup;
  position: string | null;
  joinedOn: string; // ISO date
  photoConsent: boolean | null;
};

export type SessionKind = "training" | "match" | "tournament";

export type Session = {
  id: string;
  kind: SessionKind;
  title: string;
  startsAt: string; // ISO date-time
  endsAt: string; // ISO date-time
  venue: string;
  ageGroups: AgeGroup[];
  arriveBy: string | null;
  kit: string | null;
  prayerNote: string | null;
  /** Notes for parents (travel, where to meet). */
  notes: string | null;
  cancelled: boolean;
  /** Why it was cancelled, when staff gave a reason. */
  cancelReason: string | null;
  /**
   * Tournament squads: on a squad session (only picked children see it), which of the family's children
   * are picked. Absent on an ordinary session, which is for every child in its age groups.
   */
  squad?: string[];
};

export type Availability = "coming" | "away";

export type Announcement = {
  id: string;
  topic: string;
  audience: AgeGroup[] | "all";
  title: string;
  body: string;
  postedAt: string; // ISO date-time
  requiresAck: boolean;
  postedBy: string | null;
};

export type PaymentState = "active" | "missing" | "overdue" | "self_reported";

export type ChecklistItemId = "registered" | "emergency-contacts" | "payment-plan" | "agreement" | "photo-consent";

export type Badge = {
  id: string;
  name: string;
  icon: "star" | "clock" | "trophy" | "flame" | "target";
  earnedOn?: string; // ISO date; missing = not earned yet
};

export type CoachNote = {
  from: string;
  initials: string;
  text: string;
  writtenOn: string;
};

export type StaffRole = "admin" | "coach";
