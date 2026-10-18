-- Why a child isn't coming: the club owner asked for it. Under "Not this week" a parent can add an optional short
-- reason (poorly, family wedding). It's kept on the answer, so the register shows it under "Said not coming", and it's
-- sent to the coaches as a message in a thread for that session and child (Messages), so they're told and can reply.
-- Forward-only and additive.

alter table availability
  add column away_reason text check (away_reason is null or char_length(away_reason) between 1 and 200);

-- The thread a reason goes into: one per session and child, however many times (or by however many parents) it's
-- sent. Kept as a plain conversation if the session is deleted.
alter table conversations add column session_id uuid references sessions (id) on delete set null;
create unique index conversations_away_once on conversations (session_id, player_id) where session_id is not null;
