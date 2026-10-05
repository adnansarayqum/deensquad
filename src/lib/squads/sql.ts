// SQL fragments shared by every query that decides which children a session or a message is for.
// Tournament squads (migration 0014): a session with squad rows is only for the picked children,
// and a message with squad_session_id only for that squad's families. Everything else goes by age group.
// Arguments are table aliases in the surrounding query; `p` must be a players row (or alias with id and age_group).

/** True when session `s` is for child `p`: their group's session, or a squad session they're picked for. */
export function sessionIsFor(s = "s", p = "p"): string {
  return `(case when is_squad_session(${s}.id)
    then exists (select 1 from session_squads sfq where sfq.session_id = ${s}.id and sfq.player_id = ${p}.id)
    else ${p}.age_group = any (${s}.age_groups) end)`;
}

/** True when announcement `a` reaches child `p`: a squad message to their squad, or a message for everyone or their group. */
export function newsReaches(a = "a", p = "p"): string {
  return `(case when ${a}.squad_session_id is not null
    then exists (select 1 from session_squads nrq where nrq.session_id = ${a}.squad_session_id and nrq.player_id = ${p}.id)
    else ${a}.audience is null or cardinality(${a}.audience) = 0 or ${p}.age_group = any (${a}.audience) end)`;
}
