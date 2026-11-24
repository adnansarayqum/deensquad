-- How many times a sponsor's link was tapped (24 Nov 2026, the club's request: a figure to pass on to sponsors).
--
-- Kept beside the times shown, the same way: a sponsor, a London day and a count, nothing about who tapped.

alter table sponsor_views drop constraint if exists sponsor_views_place_check;
alter table sponsor_views add constraint sponsor_views_place_check check (place in ('home', 'gate', 'page', 'click'));
