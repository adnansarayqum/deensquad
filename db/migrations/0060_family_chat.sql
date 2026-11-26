-- One chat per family (26 Nov 2026; the club's decision: messaging should work like WhatsApp, one continuous chat
-- with each family, which the club's admins and the children's coaches can read).
--
-- Conversations stay as they are underneath (one per topic, post reply or "not coming" reason, each about one
-- child); the app shows a family's conversations as one timeline. This migration adds what that needs:
--
-- * A family: the children joined through a parent they share (a child's brothers and sisters, and theirs: the
--   connected group). `player_families()` gives every child's family as the smallest child id in it, for staff
--   lists; a parent's own family is simply their own children, so parents don't need it.
-- * Who on the staff side reads a conversation widens from "covers the child" to "covers a child in the child's
--   family" (`staff_covers_family`), so a family's chat is whole for a coach of any of its children. Admins and
--   coaches of every group already read everything. Starting a conversation and medical details are unchanged.

-- Every child with their family, for staff only (nothing for anyone else).
create function player_families() returns table (player_id uuid, family_id uuid)
language sql stable security definer set search_path = public as $$
  with recursive links as (
    select a.player_id as a, b.player_id as b
    from player_guardians a join player_guardians b on b.guardian_id = a.guardian_id
  ),
  reach (player, root) as (
    select id, id from players
    union
    select l.b, r.root from reach r join links l on l.a = r.player
  )
  select player, min(root::text)::uuid from reach where is_staff() group by player;
$$;
revoke all on function player_families() from public;
grant execute on function player_families() to authenticated;

-- A member of staff covers the child or one of the child's family (see above).
create function staff_covers_family(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select staff_covers(p_player) or exists (
    with recursive fam (id) as (
      select p_player
      union
      select b.player_id from fam
        join player_guardians a on a.player_id = fam.id
        join player_guardians b on b.guardian_id = a.guardian_id
    )
    select 1 from fam where staff_covers(fam.id)
  );
$$;
revoke all on function staff_covers_family(uuid) from public;
grant execute on function staff_covers_family(uuid) to authenticated;

create or replace function sees_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id = p_conversation
      and (
        c.player_id in (select my_player_ids())
        or (c.staff_id is not null and c.staff_id in (select id from staff where auth_user_id = auth.uid()))
        or staff_covers_family(c.player_id)
      )
  );
$$;

drop policy "family and staff read conversations" on conversations;
create policy "family and staff read conversations" on conversations for select using (
  player_id in (select my_player_ids())
  or (staff_id is not null and staff_id in (select id from staff where auth_user_id = auth.uid()))
  or staff_covers_family(player_id)
);
