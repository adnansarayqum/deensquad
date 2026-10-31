-- Calendar links for more than one phone (parent UX review, Oct 2026). Until now a parent had one link, shown once;
-- adding a second phone meant Reset, which stopped the first phone's calendar. A parent can now make another link
-- (up to 5) without touching the others, and "Stop all calendar links" ends every one of them at once.
-- Forward-only and additive. The original link (guardians.calendar_token_hash) keeps working as before.

create table guardian_calendar_links (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references guardians (id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  created_at timestamptz not null default now()
);
create index guardian_calendar_links_guardian_idx on guardian_calendar_links (guardian_id);
alter table guardian_calendar_links enable row level security;
-- Parents see when their own links were made (never another parent's); writes go only through the functions below.
create policy "parent reads own calendar links" on guardian_calendar_links for select using (guardian_id = my_guardian_id());
grant select on guardian_calendar_links to authenticated;

create function add_calendar_link(p_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
begin
  if v_guardian is null or p_hash is null or length(p_hash) <> 64 then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select count(*) from guardian_calendar_links where guardian_id = v_guardian)
     + (select count(*) from guardians where id = v_guardian and calendar_token_hash is not null) >= 5 then
    raise exception 'too many links' using errcode = 'P0001';
  end if;
  insert into guardian_calendar_links (guardian_id, token_hash) values (v_guardian, p_hash);
end
$$;
revoke execute on function add_calendar_link(text) from public;
grant execute on function add_calendar_link(text) to authenticated;

create function stop_calendar_links() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
begin
  if v_guardian is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from guardian_calendar_links where guardian_id = v_guardian;
  update guardians set calendar_token_hash = null, calendar_token_created_at = null where id = v_guardian;
end
$$;
revoke execute on function stop_calendar_links() from public;
grant execute on function stop_calendar_links() to authenticated;
