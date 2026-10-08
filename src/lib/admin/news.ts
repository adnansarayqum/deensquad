import { AGE_GROUPS, type AgeGroup } from "../domain";
import type { Queryable } from "../db/types";
import { CHOSEN_MAX, type NewsChild } from "./news-audience";

// News to chosen children (migration 0022): a message with announcements.to_children reaches only the parents of
// the children in announcement_players (newsReaches in src/lib/squads/sql.ts). Its audience is those children's
// groups, so a group coach's scope (within/overlaps) treats it like any message to those groups.

/** The children the post form's picker lists: the whole club, or a group coach's own groups, with their parents' ids. */
export async function loadNewsChildren(tx: Queryable, mine: readonly AgeGroup[] | null): Promise<NewsChild[]> {
  const rows = await tx.query<{ id: string; first_name: string; last_name: string; age_group: string; guardians: string[] }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group,
       coalesce(array_agg(pg.guardian_id::text) filter (where pg.guardian_id is not null), '{}')::text[] as guardians
     from players p left join player_guardians pg on pg.player_id = p.id
     where $1::text[] is null or p.age_group::text = any ($1::text[])
     group by p.id
     order by p.first_name, p.last_name, p.id`,
    [mine ? [...mine] : null],
  );
  return rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, ageGroup: r.age_group, guardians: r.guardians }));
}

/**
 * Checks the children ticked for a "Chosen children" message: at least one, at most 200, all still in the club and,
 * for a group coach (`mine`), all in their own groups. Returns the distinct groups (the message's audience) or an error.
 */
export async function checkChosenChildren(
  tx: Queryable,
  ids: readonly string[],
  mine: readonly AgeGroup[] | null,
): Promise<{ groups: AgeGroup[] } | { error: string }> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { error: "Choose at least one child." };
  if (unique.length > CHOSEN_MAX) return { error: `Choose up to ${CHOSEN_MAX} children. For more, send it to their groups.` };
  const rows = await tx.query<{ id: string; first_name: string; age_group: string }>(
    `select id, first_name, age_group::text as age_group from players where id = any ($1::uuid[])`,
    [unique],
  );
  if (rows.length !== unique.length) return { error: "One of those children isn't in the club any more. Reload and try again." };
  if (mine) {
    const outside = rows.filter((r) => !(mine as readonly string[]).includes(r.age_group));
    if (outside.length) {
      return { error: `You can choose children in your own groups only (${mine.join(", ")}). ${outside.map((r) => r.first_name).join(", ")} ${outside.length === 1 ? "isn't" : "aren't"} in them.` };
    }
  }
  const present = new Set(rows.map((r) => r.age_group));
  return { groups: AGE_GROUPS.filter((g) => present.has(g)) };
}

export type NewNews = {
  topic: string;
  title: string;
  body: string;
  /** null: every family. */
  audience: readonly AgeGroup[] | null;
  requiresAck: boolean;
  postedBy: string;
  squadSession: string | null;
  /** The chosen children, for a "Chosen children" message (checked with checkChosenChildren first). */
  children: readonly string[] | null;
};

/** Writes the message (and its chosen children, in the same transaction). Returns its id. */
export async function insertNews(tx: Queryable, n: NewNews): Promise<string> {
  const chosen = n.children && n.children.length ? [...new Set(n.children)] : null;
  const [row] = await tx.query<{ id: string }>(
    `insert into announcements (topic, title, body, audience, requires_ack, posted_by, squad_session_id, to_children)
     values ($1, $2, $3, $4::text[]::age_group[], $5, $6, $7, $8) returning id`,
    [n.topic, n.title, n.body, n.audience ? [...n.audience] : null, n.requiresAck, n.postedBy, n.squadSession, chosen !== null],
  );
  if (chosen) {
    await tx.query(`insert into announcement_players (announcement_id, player_id) select $1::uuid, unnest($2::uuid[])`, [row.id, chosen]);
  }
  return row.id;
}
