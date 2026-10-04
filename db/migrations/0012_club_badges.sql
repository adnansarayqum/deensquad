-- The club's badges, so coaches can award them on the live app (until now only the sample club had them).
insert into badges (id, name, icon) values
  ('first-goal', 'First goal', 'star'),
  ('on-time-5', 'On time ×5', 'clock'),
  ('good-adab', 'Good adab', 'trophy'),
  ('ten-sessions', '10 sessions', 'target')
on conflict (id) do nothing;
