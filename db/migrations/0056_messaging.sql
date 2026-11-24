-- Messaging review (23 Nov 2026).
--
-- * conversations.for_admins: a parent's new message that's for the club's admins (payments, the shop, their
--   account) rather than the child's coaches. It decides who is told about it; who can read a conversation is
--   unchanged (the child's parents, their coaches, the admins).
-- * conversation_seen_by(): the name of a member of staff who has read a conversation since the parents' latest
--   message, for "Seen by Coach Javed" under a parent's message. Only for someone who can see the conversation.
--   Read marks themselves stay their owners' (parents can't read staff's rows).

alter table conversations add column for_admins boolean not null default false;

create function conversation_seen_by(p_conversation uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.display_name
  from conversation_reads r
  join staff s on s.auth_user_id = r.user_id
  where r.conversation_id = p_conversation
    and sees_conversation(p_conversation)
    and r.last_read_at >= (
      select max(m.created_at) from conversation_messages m where m.conversation_id = p_conversation and m.author_kind = 'parent'
    )
  order by r.last_read_at
  limit 1;
$$;
revoke all on function conversation_seen_by(uuid) from public;
grant execute on function conversation_seen_by(uuid) to authenticated;
