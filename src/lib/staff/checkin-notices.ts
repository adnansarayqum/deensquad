import "server-only";
import { clock } from "../dates";
import type { Queryable } from "../db/types";
import { pushConfigured, pushToEach, type PushPayload } from "../chase/senders";

// "Musa is checked in" for parents who drop off and go (the end-to-end verdict, 24 Nov 2026). An app notification
// only (no email: it's only useful in the moment), sent once a check-in has stood for a minute, so one undone straight
// away never goes. Each check-in is told once, whether or not a phone was reached.

/** A check-in is told once it's this old (an Undo within the minute means nothing is sent). */
export const SETTLE_SECONDS = 60;
/** ...and never once it's older than this (a notice an hour late would only confuse). */
export const WINDOW_MINUTES = 30;

type Push = (tx: Queryable, payloads: Map<string, PushPayload>) => Promise<Set<string>>;

export function checkedInMessage(names: readonly string[], title: string, at: string): PushPayload {
  const who = names.length === 1 ? `${names[0]} is` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} are`;
  return { title: `${who} checked in`, body: `${title}, ${clock(at)}.`, url: "/friday" };
}

/** Run as the system. Returns how many parents' phones were reached. */
export async function sendCheckInNotices(tx: Queryable, now: Date, push: Push | null = pushConfigured() ? pushToEach : null): Promise<number> {
  if (!push) return 0;
  // One run at a time: two check-ins a second apart each start one (house pattern, see "Two at once").
  await tx.query("select pg_advisory_xact_lock(727282)");
  const rows = await tx.query<{ session_id: string; player_id: string; first_name: string; title: string; checked_in_at: Date; user_id: string | null }>(
    `select a.session_id, a.player_id, p.first_name, s.title, a.checked_in_at, g.auth_user_id as user_id
     from attendance a
     join sessions s on s.id = a.session_id
     join players p on p.id = a.player_id
     left join player_guardians pg on pg.player_id = p.id
     left join guardians g on g.id = pg.guardian_id
     where a.parents_told_at is null
       and a.checked_in_at <= $1::timestamptz - make_interval(secs => $2::int)
       and a.checked_in_at > $1::timestamptz - make_interval(mins => $3::int)
       -- only around the session itself (a record added for another day's session is never announced)
       and a.checked_in_at between s.starts_at - interval '3 hours' and s.ends_at + interval '1 hour'
     order by a.checked_in_at, p.first_name`,
    [now, SETTLE_SECONDS, WINDOW_MINUTES],
  );
  if (!rows.length) return 0;
  const perUser = new Map<string, { names: string[]; title: string; at: string }>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const mine = perUser.get(r.user_id) ?? { names: [], title: r.title, at: new Date(r.checked_in_at).toISOString() };
    if (!mine.names.includes(r.first_name)) mine.names.push(r.first_name);
    perUser.set(r.user_id, mine);
  }
  const reached = perUser.size ? await push(tx, new Map([...perUser].map(([user, m]) => [user, checkedInMessage(m.names, m.title, m.at)]))) : new Set<string>();
  const told = [...new Set(rows.map((r) => `${r.session_id}:${r.player_id}`))];
  for (const key of told) {
    const [session, player] = key.split(":");
    await tx.query(`update attendance set parents_told_at = $3 where session_id = $1 and player_id = $2 and parents_told_at is null`, [session, player, now]);
  }
  return reached.size;
}
