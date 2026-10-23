import type { Queryable } from "../db/types";
import { AGE_GROUPS, type AgeGroup } from "../domain";

// The parents behind the overview's "Parents on the app: 89 · 6 not yet": every parent of a child in the groups in
// view who has never signed in, by name. The Families list goes by child (a child shows only when none of their
// parents is in), so a second parent whose partner has signed in never appeared there. Same parents as the tile's
// count (loadDashboard's `parents` CTE): linked to a child in `groups`, no sign-in.

export type ParentNotIn = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  invitedAt: string | null;
  children: { id: string; firstName: string; lastName: string; group: AgeGroup }[];
};

export async function loadParentsNotIn(tx: Queryable, limit: AgeGroup[] | null): Promise<ParentNotIn[]> {
  const groups = limit ?? [...AGE_GROUPS];
  const rows = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    invited_at: Date | null;
    children: { id: string; firstName: string; lastName: string; group: AgeGroup }[];
  }>(
    `select g.id, g.first_name, g.last_name, g.email, g.phone, g.invited_at,
       json_agg(json_build_object('id', p.id, 'firstName', p.first_name, 'lastName', p.last_name, 'group', p.age_group::text)
         order by p.first_name) as children
     from guardians g
     join player_guardians pg on pg.guardian_id = g.id
     join players p on p.id = pg.player_id and p.age_group::text = any ($1::text[])
     where g.auth_user_id is null
     group by g.id
     order by g.invited_at is null, lower(g.first_name), lower(g.last_name)`,
    [groups],
  );
  return rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    invitedAt: r.invited_at ? new Date(r.invited_at).toISOString() : null,
    children: typeof r.children === "string" ? JSON.parse(r.children) : r.children,
  }));
}
