// A per-visitor cap on the browser error-report tunnel (/monitoring), so one address can't flood the club's
// Sentry quota through the app (which Sentry would see as the server's own address). In memory: the app runs as
// one instance, and a restart only resets the counts. A real page sends a handful of reports at most.

export const TUNNEL_LIMIT = 60;
export const TUNNEL_WINDOW_MS = 60_000;
const MAX_TRACKED = 5_000;

const hits = new Map<string, { start: number; count: number }>();

/** True when this address may send another report now (and counts it). */
export function allowTunnel(ip: string | null, now = Date.now()): boolean {
  const key = ip ?? "unknown";
  const entry = hits.get(key);
  if (!entry || now - entry.start >= TUNNEL_WINDOW_MS) {
    if (hits.size >= MAX_TRACKED) {
      for (const [k, v] of hits) if (now - v.start >= TUNNEL_WINDOW_MS) hits.delete(k);
      if (hits.size >= MAX_TRACKED) hits.clear();
    }
    hits.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= TUNNEL_LIMIT;
}

export function resetTunnelLimit() {
  hits.clear();
}
