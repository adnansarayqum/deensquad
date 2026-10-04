// The Deen Squad domain model shared by the screens, the data layer and the admin.

// The club's groups: U6 (boys and girls), U7, U10 (ages 8–10), U12 (11–12), U15 (13–15).
export const AGE_GROUPS = ["U6", "U7", "U10", "U12", "U15"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export function isAgeGroup(value: unknown): value is AgeGroup {
  return typeof value === "string" && (AGE_GROUPS as readonly string[]).includes(value);
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
  cancelled: boolean;
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

export type ChecklistItemId = "registered" | "emergency-contacts" | "payment-plan" | "photo-consent";

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
