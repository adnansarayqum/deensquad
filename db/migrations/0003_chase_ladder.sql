-- The announcement chase ladder: app notification on posting, email after 24 hours,
-- text after 48 hours, flagged at the gate. Every step is logged in announcement_chases.

alter type chase_channel add value if not exists 'email';

-- Automatic steps happen at most once per parent per message. (Staff can chase on WhatsApp as often as they like.)
create unique index announcement_chases_auto_once on announcement_chases (announcement_id, guardian_id, channel)
  where channel in ('app', 'sms', 'gate');

-- Phones and browsers that asked for notifications. One person can have several.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
create policy "people manage their own devices" on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on push_subscriptions to authenticated;

-- Families can see how they were chased (so a parent's app could show "reminder sent").
create policy "family reads own chases" on announcement_chases for select using (guardian_id = my_guardian_id());
