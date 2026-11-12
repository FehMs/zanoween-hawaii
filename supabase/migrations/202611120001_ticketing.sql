begin;

create table public.ticket_products (
  id uuid primary key default gen_random_uuid(),
  lot smallint not null check (lot between 1 and 3),
  gender text not null check (gender in ('mulher', 'homem')),
  price_cents integer not null check (price_cents > 0),
  sales_enabled boolean not null default false,
  unique (lot, gender)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ticket_products(id),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  email text not null check (char_length(email) between 3 and 160),
  phone text check (char_length(phone) <= 25),
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  rg_acknowledged_at timestamptz not null,
  payment_provider text not null default 'mercado_pago' check (payment_provider = 'mercado_pago'),
  provider_payment_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  check (status <> 'paid' or (provider_payment_id is not null and paid_at is not null))
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  entry_token uuid not null unique default gen_random_uuid(),
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  revoked_at timestamptz
);

-- Reserve an event ID before processing a payment notification, to avoid duplicates.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  order_id uuid references public.orders(id),
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Future email worker retries this queue; a failed email must not erase a purchase.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  template text not null default 'purchase_confirmation' check (template = 'purchase_confirmation'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (order_id, template)
);

create index orders_status_created_idx on public.orders(status, created_at);
create index orders_email_idx on public.orders(email);
create index orders_product_idx on public.orders(product_id);
create index payment_events_order_idx on public.payment_events(order_id);
create index email_outbox_pending_idx on public.email_outbox(status, created_at);

create function public.touch_order_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger orders_updated_at before update on public.orders
for each row execute function public.touch_order_updated_at();

create function public.require_paid_order_for_ticket() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.orders where id = new.order_id and status = 'paid' for update;
  if not found then
    raise exception 'An approved order is required before issuing a ticket';
  end if;
  return new;
end;
$$;
create trigger tickets_require_payment before insert or update of order_id on public.tickets
for each row execute function public.require_paid_order_for_ticket();

alter table public.ticket_products enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.payment_events enable row level security;
alter table public.email_outbox enable row level security;

-- No browser access, including signed-in users. Access is through server code only.
revoke all on public.ticket_products, public.orders, public.tickets, public.payment_events, public.email_outbox from anon, authenticated;
grant select, insert, update, delete on public.ticket_products, public.orders, public.tickets, public.payment_events, public.email_outbox to service_role;
revoke all on function public.touch_order_updated_at() from public, anon, authenticated;
revoke all on function public.require_paid_order_for_ticket() from public, anon, authenticated;

insert into public.ticket_products (lot, gender, price_cents) values
  (1, 'mulher', 4500), (1, 'homem', 5000),
  (2, 'mulher', 5000), (2, 'homem', 5500),
  (3, 'mulher', 5500), (3, 'homem', 6000);

commit;
