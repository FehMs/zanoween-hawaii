begin;
create table public.partners (
  code text primary key check (code ~ '^[A-Z0-9_-]{3,32}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.partners enable row level security;
revoke all on public.partners from public,anon,authenticated;
grant select,insert,update on public.partners to service_role;
alter table public.orders add column partner_code text references public.partners(code);
create index orders_partner_code_idx on public.orders(partner_code) where partner_code is not null;
drop function public.reserve_checkout(uuid,text,text,text,text,text,text,boolean,smallint);
create function public.reserve_checkout(
  p_id uuid, p_access_hash text, p_name text, p_email text, p_phone text,
  p_gender text, p_ip_hash text, p_is_test boolean, p_lot smallint default 1, p_partner_code text default null
) returns jsonb language plpgsql set search_path = '' as $$
declare
  existing public.orders; product public.ticket_products; pool public.ticket_lots;
  reserved bigint; answer public.orders;
begin
  p_partner_code := nullif(upper(btrim(p_partner_code)), '');
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
    if existing.partner_code is distinct from p_partner_code or existing.access_token_hash is distinct from p_access_hash or existing.full_name <> p_name
      or existing.email <> p_email or existing.phone is distinct from p_phone or existing.is_test<>p_is_test
      or not exists(select 1 from public.ticket_products where id=existing.product_id and gender=p_gender and lot=p_lot) then
      raise exception 'request_conflict';
    end if;
    return to_jsonb(existing);
  end if;
  if p_partner_code is not null then
    if p_partner_code !~ '^[A-Z0-9_-]{3,32}$' then raise exception 'invalid_partner_code'; end if;
    perform 1 from public.partners where code=p_partner_code and active for share;
    if not found then raise exception 'invalid_partner_code'; end if;
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
  insert into public.orders(id,product_id,full_name,email,phone,price_cents,rg_acknowledged_at,access_token_hash,ip_hash,is_test,partner_code)
    values(p_id,product.id,p_name,p_email,p_phone,product.price_cents,now(),p_access_hash,p_ip_hash,p_is_test,p_partner_code)
    returning * into answer;
  return to_jsonb(answer);
end;
$$;


revoke all on function public.reserve_checkout(uuid,text,text,text,text,text,text,boolean,smallint,text) from public,anon,authenticated;
grant execute on function public.reserve_checkout(uuid,text,text,text,text,text,text,boolean,smallint,text) to service_role;
create function public.admin_partner_stats() returns jsonb language sql set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code',p.code,'name',p.name,'active',p.active,
    'paid',coalesce(s.paid,0),'pending',coalesce(s.pending,0),'revenue',coalesce(s.revenue,0)) order by p.created_at,p.code),'[]'::jsonb)
  from public.partners p left join (
    select partner_code,count(*) filter(where status='paid') as paid,
      count(*) filter(where status='pending') as pending,
      coalesce(sum(price_cents) filter(where status='paid'),0) as revenue
    from public.orders where not is_test group by partner_code
  ) s on s.partner_code=p.code;
$$;
revoke all on function public.admin_partner_stats() from public,anon,authenticated;
grant execute on function public.admin_partner_stats() to service_role;
notify pgrst, 'reload schema';
commit;
