import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup } from "../domain";
import { canManageSquad } from "../squads/squads";
import { sessionIsFor } from "../squads/sql";

// Away trips and consent (migration 0036). Staff (a group coach for sessions whose groups are all theirs, as for
// squads; admins any) add the trip details to a session; each child's parent gives or refuses consent in the app
// through give_trip_consent (own child, a session for that child, not started yet); the trip page lists who's
// cleared, who said no and who hasn't answered, with the number to call on the day.

export type Trip = {
  sessionId: string;
  meetAt: string;
  meetPoint: string;
  returnAt: string | null;
  transport: string | null;
  costPence: number | null;
  notes: string | null;
};

type TripRow = { session_id: string; meet_at: Date; meet_point: string; return_at: Date | null; transport: string | null; cost_pence: number | null; notes: string | null };
const toTrip = (r: TripRow): Trip => ({
  sessionId: r.session_id,
  meetAt: iso(r.meet_at),
  meetPoint: r.meet_point,
  returnAt: r.return_at ? iso(r.return_at) : null,
  transport: r.transport,
  costPence: r.cost_pence,
  notes: r.notes,
});

export type TripSession = { id: string; title: string; kind: string; startsAt: string; endsAt: string; venue: string; ageGroups: AgeGroup[]; cancelled: boolean };

export type TripConsent = { consent: boolean; dayPhone: string | null; note: string | null; answeredBy: string | null; answeredAt: string };

export type RosterChild = {
  id: string;
  firstName: string;
  lastName: string;
  group: AgeGroup;
  answer: TripConsent | null;
  /** A parent's mobile when the consent didn't give one. */
  parentPhone: string | null;
};

export type TripPage = { session: TripSession; trip: Trip | null; roster: RosterChild[] };

/** Staff's trip page: the session, its trip (if any) and every child it's for with their consent. Null when not theirs. */
export async function loadTripPage(tx: Queryable, sessionId: string, mine: readonly AgeGroup[] | null): Promise<TripPage | null> {
  const [s] = await tx.query<{ id: string; title: string; kind: string; starts_at: Date; ends_at: Date; venue: string; age_groups: AgeGroup[]; cancelled: boolean }>(
    `select id, title, kind::text as kind, starts_at, ends_at, venue, age_groups::text[] as age_groups, cancelled_at is not null as cancelled from sessions where id = $1`,
    [sessionId],
  );
  if (!s || !canManageSquad(s.age_groups, mine)) return null;
  const [trip] = await tx.query<TripRow>(`select * from session_trips where session_id = $1`, [sessionId]);
  const rows = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    consent: boolean | null;
    day_phone: string | null;
    note: string | null;
    answered_by: string | null;
    answered_at: Date | null;
    parent_phone: string | null;
  }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group,
       c.consent, c.day_phone, c.note, g.first_name as answered_by, c.answered_at,
       (select pg2.phone from player_guardians x join guardians pg2 on pg2.id = x.guardian_id where x.player_id = p.id and pg2.phone is not null order by pg2.created_at limit 1) as parent_phone
     from sessions s join players p on ${sessionIsFor("s", "p")}
     left join trip_consents c on c.session_id = s.id and c.player_id = p.id
     left join guardians g on g.id = c.answered_by
     where s.id = $1
     order by p.first_name, p.last_name`,
    [sessionId],
  );
  return {
    session: { id: s.id, title: s.title, kind: s.kind, startsAt: iso(s.starts_at), endsAt: iso(s.ends_at), venue: s.venue, ageGroups: s.age_groups, cancelled: s.cancelled },
    trip: trip ? toTrip(trip) : null,
    roster: rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      group: r.age_group,
      parentPhone: r.parent_phone,
      answer: r.consent === null ? null : { consent: r.consent, dayPhone: r.day_phone, note: r.note, answeredBy: r.answered_by, answeredAt: iso(r.answered_at!) },
    })),
  };
}

export type TripInput = { meetAt: Date; meetPoint: string; returnAt: Date | null; transport: string | null; costPence: number | null; notes: string | null };

export async function saveTrip(tx: Queryable, sessionId: string, input: TripInput, by: string): Promise<void> {
  await tx.query(
    `insert into session_trips (session_id, meet_at, meet_point, return_at, transport, cost_pence, notes, updated_by, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (session_id) do update set meet_at = excluded.meet_at, meet_point = excluded.meet_point, return_at = excluded.return_at,
       transport = excluded.transport, cost_pence = excluded.cost_pence, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()`,
    [sessionId, input.meetAt, input.meetPoint, input.returnAt, input.transport, input.costPence, input.notes, by],
  );
}

/** Removes the trip and every consent given for it. */
export async function deleteTrip(tx: Queryable, sessionId: string): Promise<void> {
  await tx.query(`delete from session_trips where session_id = $1`, [sessionId]);
}

export type FamilyTrip = {
  trip: Trip;
  session: { id: string; title: string; startsAt: string; venue: string };
  children: { id: string; firstName: string; answer: TripConsent | null }[];
};

/** The family's trips still to come (not cancelled, not started), each with its children's answers. */
export async function loadFamilyTrips(tx: Queryable, childIds: string[], now: Date): Promise<FamilyTrip[]> {
  if (childIds.length === 0) return [];
  const rows = await tx.query<
    TripRow & { title: string; starts_at: Date; venue: string; player_id: string; first_name: string; consent: boolean | null; day_phone: string | null; note: string | null; answered_by_name: string | null; answered_at: Date | null }
  >(
    `select t.*, s.title, s.starts_at, s.venue, p.id as player_id, p.first_name,
       c.consent, c.day_phone, c.note, g.first_name as answered_by_name, c.answered_at
     from session_trips t
     join sessions s on s.id = t.session_id
     join players p on p.id = any($1::uuid[]) and ${sessionIsFor("s", "p")}
     left join trip_consents c on c.session_id = s.id and c.player_id = p.id
     left join guardians g on g.id = c.answered_by
     where s.cancelled_at is null and s.starts_at > $2
     order by s.starts_at, p.first_name`,
    [childIds, now],
  );
  const trips = new Map<string, FamilyTrip>();
  for (const r of rows) {
    const entry = trips.get(r.session_id) ?? { trip: toTrip(r), session: { id: r.session_id, title: r.title, startsAt: iso(r.starts_at), venue: r.venue }, children: [] };
    entry.children.push({
      id: r.player_id,
      firstName: r.first_name,
      answer: r.consent === null ? null : { consent: r.consent, dayPhone: r.day_phone, note: r.note, answeredBy: r.answered_by_name, answeredAt: iso(r.answered_at!) },
    });
    trips.set(r.session_id, entry);
  }
  return [...trips.values()];
}

export async function giveTripConsent(tx: Queryable, sessionId: string, playerId: string, consent: boolean, phone: string | null, note: string | null): Promise<void> {
  await tx.query(`select give_trip_consent($1, $2, $3, $4, $5)`, [sessionId, playerId, consent, phone, note]);
}

/** "£5" / "£4.50" */
export const poundsFromPence = (p: number) => (p % 100 === 0 ? `£${p / 100}` : `£${(p / 100).toFixed(2)}`);
