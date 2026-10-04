// The Deen Squad domain model. These types are shared by the demo data source and,
// later, the Supabase data source, so screens never care where data comes from.

export type AgeGroup = "U7" | "U9" | "U11" | "U13" | "U15";

export type Guardian = {
  id: string;
  firstName: string;
  lastName: string;
  /** Language announcements are delivered in. */
  language: "en" | "ur" | "ar" | "bn" | "so";
};

export type Player = {
  id: string;
  firstName: string;
  lastInitial: string;
  shirtNumber: number;
  ageGroup: AgeGroup;
  position: string;
  joinedOn: string; // ISO date
  guardianIds: string[];
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
  briefing?: {
    arriveBy: string; // e.g. "6:20pm"
    kit: string;
    weather?: string;
    prayer: string;
  };
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
  voiceNote?: { durationSec: number; from: string };
};

export type ChecklistItemId = "registered" | "emergency-contacts" | "kit-ordered" | "payment-plan" | "photo-consent";

export type ChecklistItem = {
  id: ChecklistItemId;
  title: string;
  detail: string;
  doneDetail: string;
  actionLabel: string;
  icon: "card" | "camera" | "shirt" | "phone" | "id";
};

export type Badge = {
  id: string;
  name: string;
  icon: "star" | "clock" | "trophy" | "flame" | "target";
  earnedOn?: string; // ISO date; missing = locked
};

export type Challenge = {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
};

export type CoachNote = {
  from: string;
  initials: string;
  text: string;
  writtenOn: string;
};

export type RegisterFlag = "no_payment_plan" | "missing_consent";

export type RegisterEntry = {
  playerId: string;
  status: "checked_in" | "expected" | "away";
  checkedInAt?: string; // ISO date-time
  flag?: RegisterFlag;
};
