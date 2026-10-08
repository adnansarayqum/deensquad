// A light cap on "Download my data" (GET /api/me/export): 10 an hour per signed-in person. Each download reads the
// whole family's records, so this stops a stuck button or a script from hammering the database. In memory: the app
// runs as one instance, and a restart only resets the counts.

export const EXPORT_LIMIT = 10;
export const EXPORT_WINDOW_MS = 60 * 60_000;
const MAX_TRACKED = 5_000;

const hits = new Map<string, { start: number; count: number }>();

/** True when this person may download now (and counts it). */
export function allowExport(userId: string, now = Date.now()): boolean {
  const entry = hits.get(userId);
  if (!entry || now - entry.start >= EXPORT_WINDOW_MS) {
    if (hits.size >= MAX_TRACKED) {
      for (const [k, v] of hits) if (now - v.start >= EXPORT_WINDOW_MS) hits.delete(k);
      if (hits.size >= MAX_TRACKED) hits.clear();
    }
    hits.set(userId, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= EXPORT_LIMIT;
}

export function resetExportLimit() {
  hits.clear();
}
