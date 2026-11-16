begin;
create table public.site_settings (
  id smallint primary key check (id=1),
  content jsonb not null default '{}'::jsonb
);
insert into public.site_settings(id) values(1);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from public, anon, authenticated;
grant select, update on public.site_settings to service_role;

create function public.admin_save_lot(p_lot smallint, p_capacity integer, p_female_price integer, p_male_price integer, p_enabled boolean)
returns void language plpgsql set search_path = '' as $$
declare occupied bigint;
begin
  if p_lot is null or p_lot not between 1 and 3 or p_capacity is null or p_capacity not between 1 and 100000
    or p_female_price is null or p_female_price not between 1 and 10000000
    or p_male_price is null or p_male_price not between 1 and 10000000 or p_enabled is null then
    raise exception 'invalid_lot';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20261116);
  perform 1 from public.ticket_lots where lot=p_lot for update;
  if not found then raise exception 'invalid_lot'; end if;
  select count(*) into occupied from public.orders o join public.ticket_products p on p.id=o.product_id
    where p.lot=p_lot and not o.is_test and o.status in ('paid','pending');
  if occupied > p_capacity then raise exception 'capacity_below_reserved'; end if;
  update public.ticket_lots set capacity=p_capacity where lot=p_lot;
  update public.ticket_products set price_cents=case when gender='mulher' then p_female_price else p_male_price end,
    sales_enabled=p_enabled, capacity=null where lot=p_lot;
end;
$$;
revoke all on function public.admin_save_lot(smallint,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.admin_save_lot(smallint,integer,integer,integer,boolean) to service_role;

drop function public.reserve_checkout(uuid,text,text,text,text,text,text,boolean);
create function public.reserve_checkout(
  p_id uuid, p_access_hash text, p_name text, p_email text, p_phone text,
  p_gender text, p_ip_hash text, p_is_test boolean, p_lot smallint default 1
) returns jsonb language plpgsql set search_path = '' as $$
declare
  existing public.orders; product public.ticket_products; pool public.ticket_lots;
  reserved bigint; answer public.orders;
begin
  if p_lot is null or p_lot not between 1 and 3 then raise exception 'sales_closed'; end if;
  if char_length(p_access_hash) <> 64 or char_length(p_ip_hash) <> 64
    or char_length(btrim(p_name)) not between 3 and 120
    or char_length(p_email) > 160 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(char_length(p_phone), 0) > 25 or p_gender not in ('mulher','homem') then
    raise exception 'invalid_participant';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  select * into existing from public.orders where id = p_id for update;
  if found then
    if existing.access_token_hash is distinct from p_access_hash or existing.full_name <> p_name
      or existing.email <> p_email or existing.phone is distinct from p_phone or existing.is_test<>p_is_test
      or not exists(select 1 from public.ticket_products where id=existing.product_id and gender=p_gender and lot=p_lot) then
      raise exception 'request_conflict';
    end if;
    return to_jsonb(existing);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20261116);
  -- Serialize inventory and throttling across requests, including the two categories.
  select * into pool from public.ticket_lots where lot=p_lot for update;
  select * into product from public.ticket_products where lot=p_lot and gender=p_gender for update;
  if not found or not product.sales_enabled then raise exception 'sales_closed'; end if;
  if pool.capacity is null and product.capacity is null then raise exception 'capacity_missing'; end if;
  if (select count(*) from public.orders where ip_hash=p_ip_hash and created_at > now()-interval '15 minutes') >= 5
    or (select count(*) from public.orders where email=p_email and created_at > now()-interval '15 minutes') >= 3 then
    raise exception 'too_many_requests';
  end if;
  if pool.capacity is not null then
    select count(*) into reserved from public.orders o join public.ticket_products t on t.id=o.product_id
      where t.lot=p_lot and o.is_test=p_is_test and o.status in ('pending','paid');
    if reserved >= pool.capacity then raise exception 'sold_out'; end if;
  end if;
  if product.capacity is not null and (select count(*) from public.orders where product_id=product.id and is_test=p_is_test and status in ('pending','paid')) >= product.capacity then
    raise exception 'sold_out';
  end if;
  insert into public.orders(id,product_id,full_name,email,phone,price_cents,rg_acknowledged_at,access_token_hash,ip_hash,is_test)
    values(p_id,product.id,p_name,p_email,p_phone,product.price_cents,now(),p_access_hash,p_ip_hash,p_is_test)
    returning * into answer;
  return to_jsonb(answer);
end;
$$;


revoke all on function public.reserve_checkout(uuid,text,text,text,text,text,text,boolean,smallint) from public,anon,authenticated;
grant execute on function public.reserve_checkout(uuid,text,text,text,text,text,text,boolean,smallint) to service_role;
create function public.admin_dashboard() returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object(
    'lots', (select jsonb_agg(jsonb_build_object('lot',l.lot,'capacity',l.capacity,
      'paid',(select count(*) from public.orders o join public.ticket_products p on p.id=o.product_id where p.lot=l.lot and not o.is_test and o.status='paid'),
      'pending',(select count(*) from public.orders o join public.ticket_products p on p.id=o.product_id where p.lot=l.lot and not o.is_test and o.status='pending'),
      'revenue',(select coalesce(sum(o.price_cents),0) from public.orders o join public.ticket_products p on p.id=o.product_id where p.lot=l.lot and not o.is_test and o.status='paid'),
      'products',(select jsonb_agg(jsonb_build_object('gender',p.gender,'price_cents',p.price_cents,'sales_enabled',p.sales_enabled)) from public.ticket_products p where p.lot=l.lot)
    ) order by l.lot) from public.ticket_lots l),
    'content', (select content from public.site_settings where id=1)
  );
$$;
revoke all on function public.admin_dashboard() from public,anon,authenticated;
grant execute on function public.admin_dashboard() to service_role;
notify pgrst, 'reload schema';
commit;
