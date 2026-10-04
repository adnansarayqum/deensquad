-- Which age groups a coach looks after. Empty means every group (admins always see every group).
alter table staff add column age_groups age_group[] not null default '{}';
