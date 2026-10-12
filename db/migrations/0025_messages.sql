-- Replies, quick answers and messages between parents and the club, so families can come away from WhatsApp.
-- Forward-only and additive: two defaulted/nullable columns on announcements, new tables, functions and triggers. The
-- previous version of the app runs unchanged on this schema (it never sets the new columns or reads the new tables).
-- Doesn't depend on 0024 or 0026.
--
-- * A message can ask for a quick answer (announcements.quick_answers, 2 to 4 short options such as Yes / No): one
--   answer per child, family-level like a session answer (either parent can give or change it; who answered is kept).
--   Answering also marks the message read for that parent, so the chase ladder, read counts and the gate flag treat
--   it as read without any change of their own.
-- * A message can let parents reply (announcements.allow_replies). A reply starts, or continues, a conversation about
--   that message and one child, addressed to whoever posted it.
-- * Conversations are per child (so both parents see the thread) and addressed to one member of staff (staff_id) or,
--   when null, to the child's coaches. Admins can read every conversation (the owner's decision: no hidden chats).
--   Messages are never edited or deleted (a club record); deleting the child deletes their conversations.

create function quick_answers_ok(a text[]) returns boolean
language sql immutable as $$
  select a is null or (
    cardinality(a) between 2 and 4
    and not exists (select 1 from unnest(a) x where x is null or char_length(btrim(x)) = 0 or char_length(x) > 30)
  );
$$;

alter table announcements add column allow_replies boolean not null default false;
alter table announcements add column quick_answers text[];
alter table announcements add constraint announcements_quick_answers_ok check (quick_answers_ok(quick_answers));

create table announcement_answers (
  announcement_id uuid not null references announcements (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  guardian_id uuid references guardians (id) on delete set null,
  answer text not null check (char_length(answer) between 1 and 30),
  answered_at timestamptz not null default now(),
  primary key (announcement_id, player_id)
);
create index announcement_answers_player_idx on announcement_answers (player_id);

alter table announcement_answers enable row level security;
create policy "family and staff read answers" on announcement_answers for select using (player_id in (select my_player_ids()) or is_staff());
grant select on announcement_answers to authenticated;

-- A parent answers for one of their own children, choosing one of the message's options, only when the message
-- reaches that child (a squad message their squad's, a chosen-children message one naming them, else their group).
-- Overwrites an earlier answer (from either parent) and marks the message read for this parent. False if refused.
create function answer_announcement(p_announcement uuid, p_player uuid, p_answer text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
begin
  if v_guardian is null or p_player is null or not (p_player in (select my_player_ids())) then
    return false;
  end if;
  if not exists (
    select 1 from announcements a join players p on p.id = p_player
    where a.id = p_announcement and a.quick_answers is not null and p_answer = any (a.quick_answers)
      and case when a.squad_session_id is not null
        then exists (select 1 from session_squads q where q.session_id = a.squad_session_id and q.player_id = p.id)
        when a.to_children
        then exists (select 1 from announcement_players c where c.announcement_id = a.id and c.player_id = p.id)
        else a.audience is null or cardinality(a.audience) = 0 or p.age_group = any (a.audience) end
  ) then
    return false;
  end if;
  insert into announcement_answers (announcement_id, player_id, guardian_id, answer, answered_at)
  values (p_announcement, p_player, v_guardian, p_answer, now())
  on conflict (announcement_id, player_id) do update
    set answer = excluded.answer, guardian_id = excluded.guardian_id, answered_at = excluded.answered_at;
  insert into announcement_reads (announcement_id, guardian_id) values (p_announcement, v_guardian) on conflict do nothing;
  return true;
end
$$;

-- Conversations ----------------------------------------------------------------

create table conversations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  -- The club news it replies to, if any (kept as a plain conversation if that message is deleted).
  announcement_id uuid references announcements (id) on delete set null,
  started_by_user uuid references auth.users (id) on delete set null,
  started_by_kind text not null check (started_by_kind in ('parent', 'staff')),
  -- Who it's addressed to: the member of staff who posted the message or started it. Null: the child's coaches.
  staff_id uuid references staff (id) on delete set null,
  subject text check (subject is null or char_length(subject) between 1 and 120),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index conversations_player_idx on conversations (player_id);
create index conversations_last_idx on conversations (last_message_at desc);
-- One reply thread per message and child, however many times (or from however many parents) it's opened.
create unique index conversations_reply_once on conversations (announcement_id, player_id) where announcement_id is not null;

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  author_user uuid references auth.users (id) on delete set null,
  author_kind text not null check (author_kind in ('parent', 'staff')),
  -- Set by the trigger below from the author's own record (a parent's first name, a member of staff's display name).
  author_name text not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index conversation_messages_conversation_idx on conversation_messages (conversation_id, created_at);

-- How far each person has read each conversation (for unread dots and counts).
create table conversation_reads (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- When each person was last notified about a conversation (at most one notification per 15 minutes each).
-- recipient_id is a guardians.id or a staff.id (a parent who hasn't signed in yet can still be emailed).
-- Written only by the server's own notification run, never by a signed-in request.
create table conversation_notices (
  conversation_id uuid not null references conversations (id) on delete cascade,
  recipient_id uuid not null,
  notified_at timestamptz not null,
  primary key (conversation_id, recipient_id)
);

-- Who on the staff side covers a child: admins, coaches with no groups ticked (every group) and coaches of the
-- child's group.
create function staff_covers(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff s join players p on p.id = p_player
    where s.auth_user_id = auth.uid()
      and (s.role = 'admin' or cardinality(s.age_groups) = 0 or p.age_group = any (s.age_groups))
  );
$$;

-- Who can read a conversation: the child's own parents; staff who cover the child; the member of staff it's addressed to.
create function sees_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id = p_conversation
      and (
        c.player_id in (select my_player_ids())
        or staff_covers(c.player_id)
        or (c.staff_id is not null and c.staff_id in (select id from staff where auth_user_id = auth.uid()))
      )
  );
$$;

-- A message's author name and time come from the database, never from the request; the conversation's
-- last_message_at follows (parents can't update conversations themselves).
create function stamp_conversation_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  new.author_name := case new.author_kind
    when 'staff' then (select display_name from staff where auth_user_id = new.author_user)
    else (select first_name from guardians where auth_user_id = new.author_user)
  end;
  if new.author_name is null then
    raise exception 'unknown author' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger conversation_messages_stamp before insert on conversation_messages for each row execute function stamp_conversation_message();

create function touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end
$$;
create trigger conversation_messages_touch after insert on conversation_messages for each row execute function touch_conversation();

alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table conversation_reads enable row level security;
alter table conversation_notices enable row level security;

create policy "family and staff read conversations" on conversations for select using (
  player_id in (select my_player_ids())
  or staff_covers(player_id)
  or (staff_id is not null and staff_id in (select id from staff where auth_user_id = auth.uid()))
);
-- A parent starts one about their own child; staff about a child they cover. Always as themselves.
create policy "family and staff start conversations" on conversations for insert with check (
  started_by_user = auth.uid()
  and case started_by_kind
    when 'parent' then player_id in (select my_player_ids())
    else staff_covers(player_id)
  end
);

create policy "read messages in visible conversations" on conversation_messages for select using (sees_conversation(conversation_id));
-- Parents write only as a parent of the child; staff only as staff. Nobody updates or deletes (no policy, no grant).
create policy "write messages as yourself" on conversation_messages for insert with check (
  author_user = auth.uid()
  and sees_conversation(conversation_id)
  and case author_kind
    when 'parent' then exists (select 1 from conversations c where c.id = conversation_id and c.player_id in (select my_player_ids()))
    else is_staff()
  end
);

create policy "people keep their own read marks" on conversation_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and sees_conversation(conversation_id));

grant select, insert on conversations, conversation_messages to authenticated;
grant select, insert, update on conversation_reads to authenticated;

revoke execute on function answer_announcement(uuid, uuid, text), staff_covers(uuid), sees_conversation(uuid),
  stamp_conversation_message(), touch_conversation() from public;
grant execute on function answer_announcement(uuid, uuid, text), staff_covers(uuid), sees_conversation(uuid) to authenticated;
