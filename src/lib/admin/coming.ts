import { londonIsoDate } from "../dates";
import { AGE_GROUPS, type AgeGroup } from "../domain";
import { iso, type Queryable } from "../db/types";
import { sessionIsFor } from "../squads/sql";
import { NEXT_SESSION_FOR_GROUP } from "./dashboard";

// Who's coming (/admin/coming): the children behind the overview's "47 of 100 coming", by name. The same groups,
// sessions and children as that figure (nextSessionSummary): every group in view whose next session is on the
// earliest such London day, each child of the group the session is for (a tournament squad's picked ones only),
// with their family's answer.

export type ComingAnswer = "coming" | "away" | "none";

export type ComingChild = {
  id: string;
  firstName: string;
  lastName: string;
  group: AgeGroup;
  answer: ComingAnswer;
  reason: string | null;
};

export type ComingSession = { id: string; title: string; startsAt: string; endsAt: string; venue: string; groups: AgeGroup[] };

export type WhoIsComing = { day: string; sessions: ComingSession[]; groups: AgeGroup[]; children: ComingChild[] } | null;

export async function loadWhoIsComing(tx: Queryable, now: Date, limit: readonly AgeGroup[] | null): Promise<WhoIsComing> {
  const groups = limit ? AGE_GROUPS.filter((g) => limit.includes(g)) : [...AGE_GROUPS];
  const next = await tx.query<{ group: AgeGroup; id: string | null; title: string | null; starts_at: Date | null; ends_at: Date | null; venue: string | null; children: number }>(
    `select g.grp as "group", s.id, s.title, s.starts_at, s.ends_at, s.venue,
       (select count(*)::int from players p where p.age_group::text = g.grp and (s.id is null or ${sessionIsFor("s", "p")})) as children
     from unnest($1::text[]) with ordinality as g (grp, ord)
     left join lateral (${NEXT_SESSION_FOR_GROUP}) s on true
     order by g.ord`,
    [groups, now],
  );
  const withSession = next.filter((r) => r.id && r.starts_at && r.children > 0);
  if (withSession.length === 0) return null;
  const first = withSession.reduce((a, b) => (iso(a.starts_at!) <= iso(b.starts_at!) ? a : b));
  const day = londonIsoDate(new Date(iso(first.starts_at!)));
  const onDay = withSession.filter((r) => londonIsoDate(new Date(iso(r.starts_at!))) === day);

  const sessions: ComingSession[] = [];
  for (const r of onDay) {
    const known = sessions.find((s) => s.id === r.id);
    if (known) known.groups.push(r.group);
    else sessions.push({ id: r.id!, title: r.title ?? "", startsAt: iso(r.starts_at!), endsAt: iso(r.ends_at!), venue: r.venue ?? "", groups: [r.group] });
  }

  const rows = await tx.query<{ id: string; first_name: string; last_name: string; group: AgeGroup; answer: ComingAnswer; reason: string | null }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as "group",
       coalesce(v.answer::text, 'none') as answer, case when v.answer = 'away' then v.away_reason end as reason
     from unnest($1::text[], $2::uuid[]) as pair (grp, session_id)
     join sessions s on s.id = pair.session_id
     join players p on p.age_group::text = pair.grp and ${sessionIsFor("s", "p")}
     left join availability v on v.session_id = s.id and v.player_id = p.id
     order by p.first_name, p.last_name`,
    [onDay.map((r) => r.group), onDay.map((r) => r.id)],
  );
  return {
    day,
    sessions,
    groups: onDay.map((r) => r.group),
    children: rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, group: r.group, answer: r.answer, reason: r.reason })),
  };
}
