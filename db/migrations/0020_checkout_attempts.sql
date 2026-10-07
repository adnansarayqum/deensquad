-- Three small changes, all forward-only and nullable, so the previous version of the app runs unchanged on this schema.

-- 1. Checkout can be sent twice (a phone whose signal dropped after the server committed, a plain-form resubmit),
--    and each send used to make another order. Each basket now carries an attempt id from the moment its first line
--    is added; place_order returns the order already placed for that attempt instead of a second one.
alter table shop_orders add column attempt_id uuid;
create unique index shop_orders_attempt_idx on shop_orders (attempt_id) where attempt_id is not null;

drop function place_order(jsonb, text);

-- Parents place orders only through this function. Prices always come from the products table,
-- so a tampered basket can't change what anyone pays.
-- p_items: [{ "product": uuid, "player": uuid|null, "size": text|null, "initials": text|null, "quantity": int }]
-- p_attempt: the basket's attempt id (null from the previous version of the app). An order already placed for it
-- by this parent is returned as it is; two checkouts of one attempt at the same instant meet the unique index, and
-- the one that loses returns the winner's order.
create function place_order(p_items jsonb, p_pay_by text, p_attempt uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
  v_order uuid;
  v_total int := 0;
  v_item jsonb;
  v_product shop_products;
  v_player uuid;
  v_size text;
  v_initials text;
  v_qty int;
  v_initials_pence int;
begin
  if v_guardian is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_pay_by is null or p_pay_by not in ('card', 'bank') then raise exception 'invalid payment method' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'invalid basket' using errcode = '22023';
  end if;

  if p_attempt is not null then
    select id into v_order from shop_orders where attempt_id = p_attempt and guardian_id = v_guardian;
    if found then return v_order; end if;
  end if;

  begin
    insert into shop_orders (guardian_id, pay_by, attempt_id) values (v_guardian, p_pay_by, p_attempt) returning id into v_order;
  exception when unique_violation then
    -- The same attempt was placed by a request that got there first (and has committed, or the insert wouldn't have failed).
    select id into v_order from shop_orders where attempt_id = p_attempt and guardian_id = v_guardian;
    if found then return v_order; end if;
    raise;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from shop_products where id = (v_item ->> 'product')::uuid and active;
    if not found then raise exception 'product not available' using errcode = '22023'; end if;

    v_qty := coalesce((v_item ->> 'quantity')::int, 1);
    if v_qty < 1 or v_qty > 20 then raise exception 'invalid quantity' using errcode = '22023'; end if;

    v_size := nullif(v_item ->> 'size', '');
    if cardinality(v_product.sizes) > 0 then
      if v_size is null or not (v_size = any (v_product.sizes)) then raise exception 'invalid size' using errcode = '22023'; end if;
    else
      v_size := null;
    end if;

    v_player := nullif(v_item ->> 'player', '')::uuid;
    if v_player is not null and not (v_player in (select my_player_ids())) then
      raise exception 'not allowed' using errcode = '42501';
    end if;

    v_initials := nullif(upper(trim(v_item ->> 'initials')), '');
    v_initials_pence := 0;
    if v_initials is not null then
      if v_product.initials_price_pence is null or v_initials !~ '^[A-Z]{1,3}$' then
        raise exception 'invalid initials' using errcode = '22023';
      end if;
      v_initials_pence := v_product.initials_price_pence;
    end if;

    insert into shop_order_items (order_id, product_id, product_name, player_id, size, initials, quantity, unit_pence, initials_pence)
    values (v_order, v_product.id, v_product.name, v_player, v_size, v_initials, v_qty, v_product.price_pence, v_initials_pence);
    v_total := v_total + v_qty * (v_product.price_pence + v_initials_pence);
  end loop;

  update shop_orders set total_pence = v_total where id = v_order;
  return v_order;
end
$$;

revoke execute on function place_order(jsonb, text, uuid) from public;
grant execute on function place_order(jsonb, text, uuid) to authenticated;

-- 2. The kit photos seeded by 0013 were signed links that have since expired, so a database that never copied them
--    in retried them at every start and every hour. Forget any link not yet copied in that carries such a signature;
--    the shop shows the crest until an admin uploads a photo.
update shop_products set image_url = null where image_file_id is null and image_url like '%\_jwt=%';

-- 3. A parent or member of staff added by the club after that person first signed in (a coach who is also a parent,
--    a parent added to the staff list) is linked to their sign-in as the row is written, so the app no longer has to
--    retry the link on every request. Runs as the owner, since signed-in requests can't read auth.users.
create function public.link_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.auth_user_id is null and new.email is not null then
    select id into new.auth_user_id from auth.users where lower(email) = lower(new.email);
  end if;
  return new;
end
$$;
revoke execute on function public.link_auth_user() from public;

create trigger guardians_link_auth_user before insert or update of email on guardians
  for each row execute function public.link_auth_user();
create trigger staff_link_auth_user before insert or update of email on staff
  for each row execute function public.link_auth_user();
