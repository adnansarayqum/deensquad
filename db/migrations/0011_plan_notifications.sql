-- When parents were told about a new session plan or practice sheet (once each; quiet hours wait until 8am).
alter table session_plans add column notified_at timestamptz;
alter table practice_sheets add column notified_at timestamptz;
