-- Families who stay on pay as you go (paying for each session) instead of the monthly plan on TeamFeePay: the club
-- owner's decision. A parent says so on the To-do list's payment step, which then counts as done; the club sees
-- "Pay as you go" and can change it on the child's page, like any other payment state. Forward-only and additive.
--
-- The new enum value can't be used in the transaction that adds it (a fresh database applies every migration in one
-- transaction), so the function below is plpgsql, whose body is only checked when it runs, and casts from text.

alter type payment_state add value if not exists 'pay_as_you_go';

-- One of the caller's own children, from no plan to pay as you go. A child who's active, overdue or already said to
-- be set up is left as it is (the club decides those); a child with no row gets one.
create function report_pay_as_you_go(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (p_player in (select my_player_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into payment_status (player_id, state) values (p_player, 'pay_as_you_go'::text::payment_state)
  on conflict (player_id) do update set state = 'pay_as_you_go'::text::payment_state, updated_at = now()
  where payment_status.state::text = 'missing';
end
$$;

revoke execute on function report_pay_as_you_go(uuid) from public;
grant execute on function report_pay_as_you_go(uuid) to authenticated;
