-- A family booking a trial can say no to the one "join the club" email sent afterwards (PECR: a way to refuse
-- at the time the address is collected). False = the email may be sent, as before.
alter table trial_bookings add column no_follow_up boolean not null default false;
