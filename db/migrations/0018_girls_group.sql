-- The club's Girls group (the owner's decision): its own group like U7 or U10, for girls of any age.
-- Added last, so it sorts after U15. Postgres allows ADD VALUE inside the migration transaction (PG12+) as long as
-- the new value isn't used in that same transaction: never write 'Girls' in this file or in a later migration,
-- since a fresh database applies every migration in one transaction.
alter type age_group add value if not exists 'Girls';
