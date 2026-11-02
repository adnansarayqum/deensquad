-- "How to turn on notifications" emails (the owner's request, 2 Nov 2026): when each parent was last sent one, so an
-- admin's bulk send skips anyone emailed in the last 7 days. Written by the system only (the send runs as the system).
alter table guardians add column notification_help_sent_at timestamptz;
