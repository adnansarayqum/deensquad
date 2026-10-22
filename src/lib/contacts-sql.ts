// Shared by the parent To-do, the Families list and the spreadsheets, so all three count the same contacts.

/**
 * True for an emergency contact whose number is one of the child's own parents'. The club already has those, so
 * they don't finish the To-do step: it's for someone else to call when the parents can't be reached.
 */
export const CONTACT_IS_PARENT = `exists (
  select 1 from player_guardians pg join guardians g on g.id = pg.guardian_id
  where pg.player_id = ec.player_id and g.phone is not null and g.phone <> ''
    and regexp_replace(g.phone, '[^0-9]', '', 'g') = regexp_replace(ec.phone, '[^0-9]', '', 'g'))`;
