-- Likes on club news (parents' request, 31 Oct 2026): a heart a parent can tap on any post they can read, with the
-- number of likes shown to everyone who can see the post. One like per parent per post; tap again to take it back.
-- Parents see only their own row (so whether they liked it) and the count; staff see who liked it.
-- Forward-only and additive.

create table announcement_likes (
  announcement_id uuid not null references announcements (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, guardian_id)
);
create index announcement_likes_guardian_idx on announcement_likes (guardian_id);
alter table announcement_likes enable row level security;

-- A parent likes only as themselves, and only a post they can read (the announcements policy decides that).
create policy "guardian likes" on announcement_likes for insert with check (
  guardian_id = my_guardian_id() and exists (select 1 from announcements a where a.id = announcement_id)
);
create policy "guardian takes back own like" on announcement_likes for delete using (guardian_id = my_guardian_id());
create policy "guardian and staff read likes" on announcement_likes for select using (guardian_id = my_guardian_id() or is_staff());
grant select, insert, delete on announcement_likes to authenticated;

-- How many likes each post has, for the posts the caller asks about. Security definer because parents can't read
-- other parents' rows; it returns counts only (never who), and the app asks only about posts it has already read
-- under row level security. Post ids are random UUIDs.
create function announcement_like_counts(p_ids uuid[]) returns table (announcement_id uuid, likes int)
language sql stable security definer set search_path = public as $$
  select l.announcement_id, count(*)::int from announcement_likes l
  where l.announcement_id = any(p_ids) and auth.uid() is not null
  group by l.announcement_id
$$;
revoke all on function announcement_like_counts(uuid[]) from public;
grant execute on function announcement_like_counts(uuid[]) to authenticated;
