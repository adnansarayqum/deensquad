import type { Queryable } from "../db/types";

// A warning sign that the gate scanner isn't working: a session where coaches are marking children by hand and no
// QR code has been scanned, at a club that does use the scanner (a scan in the last three weeks). On Fri 30 Oct 2026
// the scanner stopped after one code and nobody knew until a parent said; this would have emailed during the session.

export const QUIET_SCANNER_MANUAL = 8;
export const SCANNER_IN_USE_DAYS = 21;

export async function quietScanner(tx: Queryable, sessionId: string): Promise<{ title: string; manual: number } | null> {
  const [row] = await tx.query<{ title: string; manual: number; qr: number; in_use: boolean }>(
    `select s.title,
       count(*) filter (where a.method = 'manual')::int as manual,
       count(*) filter (where a.method = 'qr')::int as qr,
       exists (select 1 from attendance x where x.method = 'qr' and x.checked_in_at > now() - make_interval(days => $2)) as in_use
     from sessions s left join attendance a on a.session_id = s.id
     where s.id = $1
     group by s.id`,
    [sessionId, SCANNER_IN_USE_DAYS],
  );
  if (!row || !row.in_use || row.qr > 0 || row.manual < QUIET_SCANNER_MANUAL) return null;
  return { title: row.title, manual: row.manual };
}
