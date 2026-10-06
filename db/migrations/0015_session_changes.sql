-- Session edits and cancellations that tell the families (Admin → Sessions).
-- Forward-only and nullable columns only, so each statement is a quick catalogue change under lock_timeout.

-- Notes for parents on a session (travel, where to meet, anything the briefing fields don't cover).
alter table sessions add column notes text;

-- Why a session was cancelled, shown to parents beside the cancellation. Cleared when it's restored.
alter table sessions add column cancel_reason text;

-- Urgent club news (posted when a session is cancelled, restored or changed): the chase ladder emails
-- at post time instead of after 24 hours. Null means not urgent.
alter table announcements add column urgent boolean;
