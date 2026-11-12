begin;

create table public.ticket_lots (
  lot smallint primary key check (lot between 1 and 3),
  capacity integer check (capacity > 0)
);
insert into public.ticket_lots(lot) values (1), (2), (3);
alter table public.ticket_products add column capacity integer check (capacity > 0);
alter table public.orders
  add column access_token_hash text,
  add column is_test boolean not null default false,
  add column ip_hash text,
  add column provider_order_id text unique,
  add column provider_status text,
  add column pix_code text,
  add column pix_image text,
  add column expires_at timestamptz not null default (now() + interval '30 minutes');
alter table public.email_outbox
  add column locked_until timestamptz,
  add column next_attempt_at timestamptz not null default now();
create index orders_ip_created_idx on public.orders(ip_hash, created_at);
alter table public.ticket_lots enable row level security;
revoke all on public.ticket_lots from anon, authenticated;
grant select, insert, update, delete on public.ticket_lots to service_role;

-- Reserve one place and freeze its price in a single transaction.
create function public.reserve_checkout(
  p_id uuid, p_access_hash text, p_name text, p_email text, p_phone text,
  p_gender text, p_ip_hash text, p_is_test boolean
) returns jsonb language plpgsql set search_path = '' as $$
declare
  existing public.orders; product public.ticket_products; pool public.ticket_lots;
  reserved bigint; answer public.orders;
begin
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
      or not exists(select 1 from public.ticket_products where id=existing.product_id and gender=p_gender and lot=1) then
      raise exception 'request_conflict';
    end if;
    return to_jsonb(existing);
  end if;
  -- Serialize inventory and throttling across requests, including the two categories.
  select * into pool from public.ticket_lots where lot=1 for update;
  select * into product from public.ticket_products where lot=1 and gender=p_gender for update;
  if not found or not product.sales_enabled then raise exception 'sales_closed'; end if;
  if pool.capacity is null and product.capacity is null then raise exception 'capacity_missing'; end if;
  if (select count(*) from public.orders where ip_hash=p_ip_hash and created_at > now()-interval '15 minutes') >= 5
    or (select count(*) from public.orders where email=p_email and created_at > now()-interval '15 minutes') >= 3 then
    raise exception 'too_many_requests';
  end if;
  if pool.capacity is not null then
    select count(*) into reserved from public.orders o join public.ticket_products t on t.id=o.product_id
      where t.lot=1 and o.is_test=p_is_test and o.status in ('pending','paid');
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

-- The server calls this only after fetching and validating the order at Mercado Pago.
create function public.apply_verified_payment(
  p_id uuid, p_provider_order text, p_payment_id text, p_status text, p_provider_status text
) returns jsonb language plpgsql set search_path = '' as $$
declare current_order public.orders; current_ticket public.tickets;
begin
  select * into current_order from public.orders where id=p_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if current_order.provider_order_id is not null and current_order.provider_order_id <> p_provider_order then
    raise exception 'payment_conflict';
  end if;
  if p_status not in ('pending','paid','expired','cancelled','refunded') then raise exception 'invalid_status'; end if;
  if current_order.status='refunded' then
    p_status := 'refunded';
  elsif current_order.status='paid' and p_status in ('pending','expired','cancelled') then
    p_status := 'paid';
  end if;
  update public.orders set provider_order_id=p_provider_order, provider_status=p_provider_status,
    provider_payment_id=coalesce(p_payment_id,provider_payment_id), status=p_status,
    paid_at=case when p_status='paid' then coalesce(paid_at,now()) else paid_at end
    where id=p_id;
  if p_status='paid' and not current_order.is_test then
    insert into public.tickets(order_id) values(p_id) on conflict(order_id) do nothing;
    insert into public.email_outbox(order_id) values(p_id) on conflict(order_id,template) do nothing;
  elsif p_status='refunded' then
    update public.tickets set revoked_at=coalesce(revoked_at,now()) where order_id=p_id;
  end if;
  select * into current_ticket from public.tickets where order_id=p_id;
  return jsonb_build_object('status',p_status,'ticket_id',current_ticket.id);
end;
$$;

create function public.claim_purchase_email(p_order_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare queued public.email_outbox; purchase public.orders; ticket public.tickets; product public.ticket_products;
begin
  select * into queued from public.email_outbox where order_id=p_order_id for update;
  if not found or queued.status='sent' or queued.attempts>=10
    or queued.next_attempt_at>now() or queued.locked_until>now() then return null; end if;
  select * into purchase from public.orders where id=p_order_id and status='paid';
  select * into ticket from public.tickets where order_id=p_order_id and revoked_at is null;
  if purchase.id is null or ticket.id is null then return null; end if;
  select * into product from public.ticket_products where id=purchase.product_id;
  update public.email_outbox set status='sending',attempts=attempts+1,locked_until=now()+interval '2 minutes' where id=queued.id;
  return jsonb_build_object('outbox_id',queued.id,'attempt',queued.attempts+1,'email',purchase.email,
    'name',purchase.full_name,'price_cents',purchase.price_cents,'gender',product.gender,'lot',product.lot,'entry_token',ticket.entry_token,'order_id',purchase.id);
end;
$$;

create function public.finish_purchase_email(p_id uuid, p_attempt integer, p_message_id text) returns void
language plpgsql set search_path = '' as $$
begin
  update public.email_outbox set
    status=case when p_message_id is null then 'failed' else 'sent' end,
    provider_message_id=p_message_id,
    sent_at=case when p_message_id is null then null else now() end,
    next_attempt_at=now() + interval '5 minutes' * least(attempts,12), locked_until=null
    where id=p_id and attempts=p_attempt and status='sending';
end;
$$;

create function public.admit_ticket(p_token uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare ticket public.tickets; purchase public.orders;
begin
  select o.* into purchase from public.orders o join public.tickets t on t.order_id=o.id where t.entry_token=p_token for update of o;
  if not found or purchase.status <> 'paid' or purchase.is_test then raise exception 'invalid_ticket'; end if;
  select * into ticket from public.tickets where entry_token=p_token for update;
  if ticket.revoked_at is not null then raise exception 'invalid_ticket'; end if;
  if ticket.checked_in_at is not null then raise exception 'ticket_already_used'; end if;
  update public.tickets set checked_in_at=now() where id=ticket.id;
  return jsonb_build_object('name',purchase.full_name,'admitted',true);
end;
$$;

revoke all on function public.reserve_checkout(uuid,text,text,text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.apply_verified_payment(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.claim_purchase_email(uuid) from public,anon,authenticated;
revoke all on function public.finish_purchase_email(uuid,integer,text) from public,anon,authenticated;
revoke all on function public.admit_ticket(uuid) from public,anon,authenticated;
grant execute on function public.reserve_checkout(uuid,text,text,text,text,text,text,boolean) to service_role;
grant execute on function public.apply_verified_payment(uuid,text,text,text,text) to service_role;
grant execute on function public.claim_purchase_email(uuid) to service_role;
grant execute on function public.finish_purchase_email(uuid,integer,text) to service_role;
grant execute on function public.admit_ticket(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
