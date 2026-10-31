-- News about a session (parent UX review, Oct 2026): parents saw "cancelled", "back on" and "cancelled" posts for the
-- same session side by side and had to work out which was current. A session notice (cancelled / restored / changed,
-- posted by postSessionNotice) and a "Who's coming?" post now name their session, so the app can mark older notices
-- out of date and show the session's status now, and a "Who's coming?" post can carry Coming / Not coming buttons.
-- Forward-only and additive: two nullable columns. Older posts have neither and show as before.

alter table announcements add column session_id uuid references sessions (id) on delete set null;
alter table announcements add column session_notice text
  check (session_notice in ('cancelled', 'restored', 'changed', 'attendance'));
-- No check tying the two: deleting a session clears session_id (on delete set null) and keeps the notice as plain news.
create index announcements_session_idx on announcements (session_id) where session_id is not null;
