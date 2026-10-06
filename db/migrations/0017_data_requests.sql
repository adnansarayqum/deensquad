-- Parents' requests about their own data (Player → Your data). For now only "delete my account": the parent asks in
-- the app, the club is emailed and admins see it on the overview. Nothing is deleted automatically: an admin removes
-- the family on Admin → Families (which already deletes parents left with no children and their sign-ins) or marks
-- the request done.
-- Forward-only: a new table, two functions and a trigger. Nothing here changes existing rows.

create table data_requests (
  id uuid primary key default gen_random_uuid(),
  -- Set to null when the parent is deleted, so a handled request keeps no one's details.
  guardian_id uuid references guardians (id) on delete set null,
  kind text not null check (kind in ('delete')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
-- One open request of each kind per parent: asking twice records (and emails the club) once.
create unique index data_requests_open_key on data_requests (guardian_id, kind) where handled_at is null;

alter table data_requests enable row level security;
create policy "admins handle data requests" on data_requests for all using (is_admin()) with check (is_admin());
create policy "parents read own data requests" on data_requests for select using (guardian_id = my_guardian_id());
grant select, insert, update on data_requests to authenticated;

-- Parents ask only through this, for themselves. Returns true when a new request was recorded, false when one is open.
create function request_account_deletion() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
  v_id uuid;
begin
  if v_guardian is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into data_requests (guardian_id, kind) values (v_guardian, 'delete')
  on conflict (guardian_id, kind) where handled_at is null do nothing
  returning id into v_id;
  return v_id is not null;
end
$$;
revoke execute on function request_account_deletion() from public;
grant execute on function request_account_deletion() to authenticated;

-- A parent removed by an admin (with their last child, or unlinked from it) has had their request handled.
create function close_data_requests() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update data_requests set handled_at = now() where guardian_id = old.id and handled_at is null;
  return old;
end
$$;
revoke execute on function close_data_requests() from public;
create trigger guardians_close_data_requests before delete on guardians for each row execute function close_data_requests();
