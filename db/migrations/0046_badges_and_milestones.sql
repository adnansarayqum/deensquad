-- Badges and the 20-point reward (the owner's voice note, 2 Nov 2026).
--  * Coaches give five badges: Good adab, Great teamwork, Great goal, Great listening, Gave salam.
--  * "10 sessions" and "On time ×5" come from the register, so only admins give them (`given_by = 'admin'`); the
--    admins' Rewards page lists who has earned them.
--  * "First goal" is retired: children who have it keep it, nobody new gets it.
--  * A child reaching 20 points gets a reward from the owner: `points_milestones` records it once per child, tells
--    the admins and the parents, and the admin ticks "Reward given".
-- Forward-only and additive.

alter table badges drop constraint if exists badges_icon_check;
alter table badges add constraint badges_icon_check check (icon in ('star', 'clock', 'trophy', 'flame', 'target', 'users', 'goal', 'ear', 'hand'));
alter table badges add column given_by text not null default 'coach' check (given_by in ('coach', 'admin'));
alter table badges add column retired boolean not null default false;
alter table badges add column sort smallint not null default 100;

insert into badges (id, name, icon) values
  ('good-adab', 'Good adab', 'trophy'),
  ('great-teamwork', 'Great teamwork', 'users'),
  ('great-goal', 'Great goal', 'goal'),
  ('great-listening', 'Great listening', 'ear'),
  ('gave-salam', 'Gave salam', 'hand'),
  ('ten-sessions', '10 sessions', 'target'),
  ('on-time-5', 'On time ×5', 'clock')
on conflict (id) do nothing;

update badges set sort = 1 where id = 'good-adab';
update badges set sort = 2 where id = 'great-teamwork';
update badges set sort = 3 where id = 'great-goal';
update badges set sort = 4 where id = 'great-listening';
update badges set sort = 5 where id = 'gave-salam';
update badges set sort = 6, given_by = 'admin' where id = 'ten-sessions';
update badges set sort = 7, given_by = 'admin' where id = 'on-time-5';
update badges set retired = true, sort = 50 where id = 'first-goal';

-- One row per child per milestone (20 points). Told columns are set only once someone got it, so the hourly cron
-- can retry; rewarded once an admin has given the reward.
create table points_milestones (
  player_id uuid not null references players (id) on delete cascade,
  points int not null check (points > 0),
  reached_at timestamptz not null default now(),
  admins_told_at timestamptz,
  parents_told_at timestamptz,
  rewarded_at timestamptz,
  rewarded_by uuid references staff (id) on delete set null,
  primary key (player_id, points)
);
alter table points_milestones enable row level security;
create policy "staff read milestones" on points_milestones for select using (is_staff());
create policy "admins mark rewards" on points_milestones for update using (is_admin()) with check (is_admin());
grant select on points_milestones to authenticated;
grant update (rewarded_at, rewarded_by) on points_milestones to authenticated;

-- Children already on 20 points or more when this went in: listed for the admins to reward, but nobody is emailed
-- or notified about them (a deploy shouldn't send a burst of old news). U15 has no points (the owner's decision).
insert into points_milestones (player_id, points, reached_at, admins_told_at, parents_told_at)
select a.player_id, 20, now(), now(), now()
from player_awards a join players p on p.id = a.player_id
where p.age_group::text <> 'U15'
group by a.player_id
having sum(a.points) >= 20
on conflict do nothing;
