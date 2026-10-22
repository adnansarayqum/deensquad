-- An emergency contact whose number is one of the child's own parents' no longer counts: the club already has
-- that number, and the step is for someone else to call when the parents can't be reached. Same columns as 0002.
create or replace view family_gaps with (security_invoker = true) as
select
  p.id as player_id,
  p.first_name,
  p.last_name,
  p.age_group,
  coalesce(ps.state, 'missing') as payment,
  exists (
    select 1 from player_guardians pg join guardians g on g.id = pg.guardian_id
    where pg.player_id = p.id and g.auth_user_id is not null
  ) as in_app,
  p.photo_consent is not null as consent_recorded,
  (select count(*) from emergency_contacts ec
   where ec.player_id = p.id
     and not exists (
       select 1 from player_guardians pg join guardians g on g.id = pg.guardian_id
       where pg.player_id = ec.player_id and g.phone is not null and g.phone <> ''
         and regexp_replace(g.phone, '[^0-9]', '', 'g') = regexp_replace(ec.phone, '[^0-9]', '', 'g')))::int as emergency_contacts
from players p
left join payment_status ps on ps.player_id = p.id;
