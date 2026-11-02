-- Which parents have app notifications on (the owner's question, 2 Nov 2026). A parent has them on when at least one
-- phone or browser they signed in on saved a push subscription. Devices belong to their owners under row level
-- security, so staff ask through this function: it answers yes or no only (never the device or its address), and only
-- to staff or the parent themselves.
create function guardian_notifications_on(p_guardian uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (is_staff() or p_guardian = my_guardian_id())
    and exists (select 1 from guardians g join push_subscriptions s on s.user_id = g.auth_user_id where g.id = p_guardian)
$$;
revoke all on function guardian_notifications_on(uuid) from public;
grant execute on function guardian_notifications_on(uuid) to authenticated;
