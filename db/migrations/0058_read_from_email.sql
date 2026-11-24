-- "I've read this" straight from the reminder email (24 Nov 2026).
--
-- The reminder email carries the whole post, so a parent could read it there and never show as having seen it. Its
-- button now opens a page that needs one tap and no sign-in (/read/<token>, a signed link for that parent and that
-- post). The read is kept like any other, marked as coming from the email.

alter table announcement_reads drop constraint if exists announcement_reads_via_check;
alter table announcement_reads add constraint announcement_reads_via_check check (via in ('app', 'notification', 'email'));
