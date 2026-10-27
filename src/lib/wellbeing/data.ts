import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup } from "../domain";

// Wellbeing check-ins (migration 0037). Special-category data about children: parents give it, with consent each
// time; only the child's own parents and the club's admins read it (RLS), never coaches or other families; nothing
// else (exports, AI, news, logs) selects this table, and the admins' alert email never carries the note.

export const MOODS = { good: "Good", ok: "OK", low: "Not great" } as const;
export type Mood = keyof typeof MOODS;
export const isMood = (v: unknown): v is Mood => typeof v === "string" && v in MOODS;
export const WELLBEING_NOTE_MAX = 500;
/** How often News asks: not when there's been a check-in for the child in this many days. */
export const ASK_EVERY_DAYS = 28;

export type Checkin = { id: string; playerId: string; mood: Mood; note: string | null; givenBy: string | null; createdAt: string; followedUpAt: string | null };

/** A parent's check-in. Returns its id; refuses another family's child or a missing consent (in the function). */
export async function giveCheckin(tx: Queryable, playerId: string, mood: Mood, note: string | null, consent: boolean): Promise<string> {
  const [row] = await tx.query<{ id: string }>(`select give_wellbeing_checkin($1, $2, $3, $4) as id`, [playerId, mood, note, consent]);
  return row.id;
}

/** The family's own check-ins, newest first (Player screen). */
export async function loadFamilyCheckins(tx: Queryable, childIds: string[]): Promise<Checkin[]> {
  if (childIds.length === 0) return [];
  const rows = await tx.query<{ id: string; player_id: string; mood: Mood; note: string | null; given_by: string | null; created_at: Date; followed_up_at: Date | null }>(
    `select w.id, w.player_id, w.mood, w.note, g.first_name as given_by, w.created_at, w.followed_up_at
     from wellbeing_checkins w left join guardians g on g.id = w.given_by
     where w.player_id = any($1::uuid[]) order by w.created_at desc limit 50`,
    [childIds],
  );
  return rows.map((r) => ({ id: r.id, playerId: r.player_id, mood: r.mood, note: r.note, givenBy: r.given_by, createdAt: iso(r.created_at), followedUpAt: r.followed_up_at ? iso(r.followed_up_at) : null }));
}

/**
 * The children News should ask about: checked in at a session in the last 7 days, and no check-in for them in the
 * last ASK_EVERY_DAYS. Gentle by design: about once a month, only after they've been to training.
 */
export async function childrenToAsk(tx: Queryable, childIds: string[], now: Date): Promise<string[]> {
  if (childIds.length === 0) return [];
  const rows = await tx.query<{ id: string }>(
    `select p.id from players p
     where p.id = any($1::uuid[])
       and exists (select 1 from attendance a join sessions s on s.id = a.session_id where a.player_id = p.id and s.starts_at > $2::timestamptz - interval '7 days' and s.starts_at <= $2)
       and not exists (select 1 from wellbeing_checkins w where w.player_id = p.id and w.created_at > $2::timestamptz - make_interval(days => $3))
     order by p.first_name`,
    [childIds, now, ASK_EVERY_DAYS],
  );
  return rows.map((r) => r.id);
}

export type AdminCheckin = Checkin & { child: string; group: AgeGroup; followedUpBy: string | null };

/** Admins: check-ins that need a look (not great, or with a note), open ones first, then the last 30 days' others. */
export async function loadAdminCheckins(tx: Queryable, now: Date): Promise<{ open: AdminCheckin[]; recent: AdminCheckin[] }> {
  const rows = await tx.query<{
    id: string;
    player_id: string;
    mood: Mood;
    note: string | null;
    given_by: string | null;
    created_at: Date;
    followed_up_at: Date | null;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    followed_up_by: string | null;
  }>(
    `select w.id, w.player_id, w.mood, w.note, g.first_name as given_by, w.created_at, w.followed_up_at,
       p.first_name, p.last_name, p.age_group::text as age_group, sn.display_name as followed_up_by
     from wellbeing_checkins w join players p on p.id = w.player_id
     left join guardians g on g.id = w.given_by left join staff_names sn on sn.id = w.followed_up_by
     where (w.followed_up_at is null and (w.mood = 'low' or w.note is not null)) or w.created_at > $1::timestamptz - interval '30 days'
     order by w.created_at desc limit 300`,
    [now],
  );
  const all = rows.map(
    (r): AdminCheckin => ({
      id: r.id,
      playerId: r.player_id,
      mood: r.mood,
      note: r.note,
      givenBy: r.given_by,
      createdAt: iso(r.created_at),
      followedUpAt: r.followed_up_at ? iso(r.followed_up_at) : null,
      child: `${r.first_name} ${r.last_name}`,
      group: r.age_group,
      followedUpBy: r.followed_up_by,
    }),
  );
  const needsLook = (c: AdminCheckin) => !c.followedUpAt && (c.mood === "low" || c.note !== null);
  return { open: all.filter(needsLook), recent: all.filter((c) => !needsLook(c)) };
}

export async function countOpenCheckins(tx: Queryable): Promise<number> {
  const [row] = await tx.query<{ n: number }>(`select count(*)::int as n from wellbeing_checkins where followed_up_at is null and (mood = 'low' or note is not null)`);
  return row.n;
}

export async function markFollowedUp(tx: Queryable, id: string, staffId: string): Promise<void> {
  await tx.query(`update wellbeing_checkins set followed_up_at = now(), followed_up_by = $2 where id = $1 and followed_up_at is null`, [id, staffId]);
}

/** For the alert email (system): the child's first name and group, never the mood words or the note. */
export async function checkinForAlert(tx: Queryable, id: string): Promise<{ firstName: string; group: AgeGroup; needsLook: boolean } | null> {
  const [row] = await tx.query<{ first_name: string; age_group: AgeGroup; needs: boolean }>(
    `select p.first_name, p.age_group::text as age_group, (w.mood = 'low' or w.note is not null) as needs
     from wellbeing_checkins w join players p on p.id = w.player_id where w.id = $1`,
    [id],
  );
  return row ? { firstName: row.first_name, group: row.age_group, needsLook: row.needs } : null;
}

export async function markAlerted(tx: Queryable, id: string): Promise<void> {
  await tx.query(`update wellbeing_checkins set alerted_at = now() where id = $1`, [id]);
}
