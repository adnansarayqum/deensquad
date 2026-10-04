-- Sign-in for the Deen Squad app.
-- Shaped like Supabase's auth schema (auth.users, auth.uid()) so the row level security
-- policies in 0002 read naturally, but it all lives in this one Postgres database.
--
-- How a request is scoped: the app connects as the database owner, and for every signed-in
-- request it opens a transaction, sets app.user_id and switches to the `authenticated` role.
-- That role has no BYPASSRLS, so every policy applies. Sign-in itself runs as the owner.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end
$$;

-- Lets the connecting user `set role authenticated` even when it is not a superuser.
grant authenticated to current_user;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create unique index users_email_key on auth.users (lower(email));

-- The signed-in user for the current transaction, or null.
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- One row per emailed sign-in. The 6-digit code and the link token are stored only as hashes.
create table auth.sign_in_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('sign_in', 'invite')),
  code_hash text,
  link_hash text not null unique,
  attempts int not null default 0,
  ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index sign_in_requests_email_idx on auth.sign_in_requests (lower(email), created_at);
create index sign_in_requests_ip_idx on auth.sign_in_requests (ip, created_at);

-- Signed-in devices. The id is the SHA-256 of the cookie value, so a database leak reveals no sessions.
create table auth.sessions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_user_idx on auth.sessions (user_id);

-- Signed-in requests may call auth.uid() but cannot read any auth table.
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
