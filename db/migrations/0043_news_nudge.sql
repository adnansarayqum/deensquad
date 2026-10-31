-- "Send a reminder now" on a club message (Coach Javed's request, 31 Oct 2026): staff can push the parents who
-- haven't read it again, on top of the automatic ladder. Each parent reached is logged as 'nudge' (not unique, unlike
-- the automatic 'app'), so the not-read list shows it and the action can refuse a second send within the hour.
-- Only adds the value; nothing in this migration uses it.
alter type chase_channel add value if not exists 'nudge';
