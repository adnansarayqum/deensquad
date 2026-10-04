-- Club documents a parent agrees to for each child (the player-parent contract now; safeguarding later).
-- `document` names the version, so a new season's contract (a new id) asks everyone to agree again.
create table agreements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  guardian_id uuid references guardians (id) on delete set null,
  document text not null,
  parent_name text not null,
  player_name text not null,
  signed_at timestamptz not null default now(),
  unique (player_id, document)
);

alter table agreements enable row level security;
create policy "family reads own agreements" on agreements for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff manage agreements" on agreements for all using (is_staff()) with check (is_staff());
grant select, insert, update, delete on agreements to authenticated;

-- Parents agree only through this, and only for their own children.
create function sign_agreement(p_player uuid, p_document text, p_parent_name text, p_player_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_guardian_id() is null or not (p_player in (select my_player_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(trim(p_parent_name), '') = '' or coalesce(trim(p_player_name), '') = '' or char_length(p_document) > 80 then
    raise exception 'invalid agreement' using errcode = '22023';
  end if;
  insert into agreements (player_id, guardian_id, document, parent_name, player_name)
  values (p_player, my_guardian_id(), p_document, left(trim(p_parent_name), 80), left(trim(p_player_name), 80))
  on conflict (player_id, document) do nothing;
end
$$;
revoke execute on function sign_agreement(uuid, text, text, text) from public;
grant execute on function sign_agreement(uuid, text, text, text) to authenticated;
