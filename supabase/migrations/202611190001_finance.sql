begin;

create table public.event_expenses (
  id uuid primary key,
  description text not null check (char_length(btrim(description)) between 2 and 160),
  category text not null check (category in ('estrutura','bebidas','alimentacao','equipe','divulgacao','taxas','outros')),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  expense_date date not null check (expense_date between date '2000-01-01' and date '2100-12-31'),
  created_at timestamptz not null default now()
);
create index event_expenses_date_idx on public.event_expenses(expense_date desc, created_at desc, id);
alter table public.event_expenses enable row level security;
revoke all on public.event_expenses from public, anon, authenticated;
grant select, insert, update, delete on public.event_expenses to service_role;

create function public.admin_finance(p_page integer default 0) returns jsonb
language sql stable set search_path = '' as $$
  with totals as (
    select
      (select coalesce(sum(price_cents),0) from public.orders where status='paid' and not is_test) as revenue,
      coalesce(sum(amount_cents),0) as expenses,
      count(*) as expense_count
    from public.event_expenses
  )
  select jsonb_build_object(
    'revenueCents', revenue, 'expenseCents', expenses, 'profitCents', revenue-expenses,
    'expenseCount', expense_count, 'page', p_page,
    'hasMore', expense_count > (p_page::bigint+1)*50,
    'expenses', coalesce((select jsonb_agg(to_jsonb(e) order by e.expense_date desc,e.created_at desc,e.id)
      from (select id,description,category,amount_cents,expense_date,created_at
        from public.event_expenses order by expense_date desc,created_at desc,id
        limit 50 offset greatest(p_page,0)::bigint*50) e),'[]'::jsonb)
  ) from totals;
$$;
revoke all on function public.admin_finance(integer) from public, anon, authenticated;
grant execute on function public.admin_finance(integer) to service_role;
notify pgrst, 'reload schema';
commit;
