-- The club shop: kit ordered for a named child, paid to the club by card (SumUp) or bank transfer,
-- then ordered from the supplier, made ready and handed out at Friday training.

create type order_status as enum ('awaiting_payment', 'paid', 'ordered', 'ready', 'collected', 'cancelled');

create table shop_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_pence int not null check (price_pence >= 0),
  sizes text[] not null default '{}', -- empty means one size
  initials_price_pence int check (initials_price_pence >= 0), -- null means initials aren't offered
  image_url text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table shop_orders (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid references guardians (id) on delete set null,
  status order_status not null default 'awaiting_payment',
  pay_by text not null default 'card' check (pay_by in ('card', 'bank')),
  total_pence int not null default 0,
  sumup_checkout_id text unique,
  paid_at timestamptz,
  notified_at timestamptz, -- when the club was emailed about the order
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_orders_guardian_idx on shop_orders (guardian_id, created_at desc);
create index shop_orders_status_idx on shop_orders (status);

create table shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references shop_orders (id) on delete cascade,
  product_id uuid references shop_products (id) on delete set null,
  product_name text not null, -- kept even if the product is later removed
  player_id uuid references players (id) on delete set null,
  size text,
  initials text,
  quantity int not null check (quantity between 1 and 20),
  unit_pence int not null,
  initials_pence int not null default 0
);
create index shop_order_items_order_idx on shop_order_items (order_id);
create index shop_order_items_player_idx on shop_order_items (player_id);

alter table shop_products enable row level security;
alter table shop_orders enable row level security;
alter table shop_order_items enable row level security;

create policy "signed in reads products" on shop_products for select using (auth.uid() is not null);
create policy "staff manage products" on shop_products for all using (is_staff()) with check (is_staff());

create policy "family reads own orders" on shop_orders for select using (guardian_id = my_guardian_id() or is_staff());
create policy "staff manage orders" on shop_orders for all using (is_staff()) with check (is_staff());

create policy "family reads own order items" on shop_order_items for select using (
  order_id in (select id from shop_orders where guardian_id = my_guardian_id()) or is_staff()
);
create policy "staff manage order items" on shop_order_items for all using (is_staff()) with check (is_staff());

-- Parents place orders only through this function. Prices always come from the products table,
-- so a tampered basket can't change what anyone pays.
-- p_items: [{ "product": uuid, "player": uuid|null, "size": text|null, "initials": text|null, "quantity": int }]
create function place_order(p_items jsonb, p_pay_by text) returns uuid
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

  insert into shop_orders (guardian_id, pay_by) values (v_guardian, p_pay_by) returning id into v_order;

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

revoke execute on function place_order(jsonb, text) from public;
grant execute on function place_order(jsonb, text) to authenticated;

grant select, insert, update, delete on shop_products, shop_orders, shop_order_items to authenticated;
