-- Pictures and videos on club news, session details and staff messages (Oct 2026, the owner's request). The files
-- live in a private storage bucket (Railway, src/lib/media/store.ts), never in Postgres: a row here names the object.
-- Staff upload first (POST /api/media, which writes these rows as the system), then the post, session or message
-- links them. Anyone may open a picture or video only where they can already read what it's attached to: the
-- policies below lean on announcements', sessions' and conversation_messages' own row level security. Anything not
-- linked a day after upload (a form never sent, or what it was on deleted) is removed by the hourly cron, object
-- first. Forward-only and additive.

create table media (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'video')),
  mime text not null check (mime in ('image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm')),
  bytes bigint not null check (bytes > 0),
  object_key text not null unique,
  -- A still from the video (JPEG), shown before it plays.
  poster_key text,
  width int check (width is null or width > 0),
  height int check (height is null or height > 0),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  uploaded_by uuid references staff (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Each picture or video belongs to one thing, in the order it was added.
create table announcement_media (
  announcement_id uuid not null references announcements (id) on delete cascade,
  media_id uuid not null unique references media (id) on delete cascade,
  position smallint not null,
  primary key (announcement_id, media_id)
);
create table session_media (
  session_id uuid not null references sessions (id) on delete cascade,
  media_id uuid not null unique references media (id) on delete cascade,
  position smallint not null,
  primary key (session_id, media_id)
);
create table message_media (
  message_id uuid not null references conversation_messages (id) on delete cascade,
  media_id uuid not null unique references media (id) on delete cascade,
  position smallint not null,
  primary key (message_id, media_id)
);
create index media_created_idx on media (created_at);

alter table media enable row level security;
alter table announcement_media enable row level security;
alter table session_media enable row level security;
alter table message_media enable row level security;

-- The link rows are visible wherever what they link to is (each subquery is under that table's own policies).
create policy "read news media links" on announcement_media for select using (
  is_staff() or exists (select 1 from announcements a where a.id = announcement_id)
);
create policy "read session media links" on session_media for select using (
  is_staff() or exists (select 1 from sessions s where s.id = session_id)
);
create policy "read message media links" on message_media for select using (
  exists (select 1 from conversation_messages m where m.id = message_id)
);
create policy "staff link news media" on announcement_media for insert with check (is_staff());
create policy "staff link session media" on session_media for insert with check (is_staff());
create policy "staff unlink session media" on session_media for delete using (is_staff());
-- Only staff attach pictures and videos to messages (the owner's decision), and only to their own message.
create policy "staff link message media" on message_media for insert with check (
  is_staff() and exists (
    select 1 from conversation_messages m where m.id = message_id and m.author_kind = 'staff' and m.author_user = auth.uid()
  )
);

create policy "read media where it's attached" on media for select using (
  is_staff()
  or exists (select 1 from announcement_media l where l.media_id = id)
  or exists (select 1 from session_media l where l.media_id = id)
  or exists (select 1 from message_media l where l.media_id = id)
);

grant select on media to authenticated;
grant select, insert on announcement_media, message_media to authenticated;
grant select, insert, delete on session_media to authenticated;
