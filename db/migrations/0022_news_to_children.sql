-- News to chosen children: a coach picks the children a message is about ("Kaizan has been picked for the squad")
-- and it reaches only those children's parents, not their whole group.
-- Forward-only and additive: one table and one defaulted column, so the previous version of the app runs unchanged
-- (it never sets the flag, and the policy below keeps a chosen-children message from other families either way).
--
-- announcements.to_children marks such a message. It's a column rather than "has rows in announcement_players"
-- because a parent can read only their own children's rows there, so from a parent's side every other family's
-- chosen-children message would look like an ordinary group message. audience still holds the chosen children's
-- groups, so a group coach's scope (within/overlaps) works on it as on any other message.

alter table announcements add column to_children boolean not null default false;

create table announcement_players (
  announcement_id uuid not null references announcements (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  primary key (announcement_id, player_id)
);
create index announcement_players_player_idx on announcement_players (player_id);

alter table announcement_players enable row level security;
-- A family sees only its own children's rows, never who else a message was for.
create policy "family reads own chosen places" on announcement_players for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff choose children" on announcement_players for all using (is_staff()) with check (is_staff());
grant select, insert, update, delete on announcement_players to authenticated;

-- The subquery runs under the policy above, so it finds a row only for one of this family's own children.
drop policy "family reads announcements" on announcements;
create policy "family reads announcements" on announcements for select using (
  is_staff() or case
    when squad_session_id is not null then in_my_squad(squad_session_id)
    when to_children then exists (
      select 1 from announcement_players ap where ap.announcement_id = announcements.id and ap.player_id in (select my_player_ids())
    )
    else audience is null or audience && my_age_groups()
  end
);
