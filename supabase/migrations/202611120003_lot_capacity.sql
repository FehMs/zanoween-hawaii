begin;

-- Confirmed total inventory per lot, shared by Mulher and Homem.
insert into public.ticket_lots (lot, capacity) values (1, 30), (2, 30), (3, 20)
on conflict (lot) do update set capacity = excluded.capacity;

-- No separate category quotas; keep the shared lot limit as the source of truth.
update public.ticket_products set capacity = null where lot in (1, 2, 3);

-- This migration intentionally does not change sales_enabled or approve any order.
commit;
