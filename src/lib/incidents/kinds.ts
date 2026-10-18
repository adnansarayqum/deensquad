// The kinds of incident a coach can log, and the text limit: shared by the form (in the browser) and the server.

export const INCIDENT_KINDS = {
  injury: "Injury",
  illness: "Felt unwell",
  behaviour: "Behaviour",
  other: "Something else",
} as const;
export type IncidentKind = keyof typeof INCIDENT_KINDS;
export const isIncidentKind = (v: unknown): v is IncidentKind => typeof v === "string" && v in INCIDENT_KINDS;

export const INCIDENT_TEXT_MAX = 2000;
