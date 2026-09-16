-- Human-readable daily numbers are allocated inside the order transaction.
-- Existing receipts keep their identifiers and fall back to UUID display.
alter table public.tenants add column if not exists timezone text not null default 'Asia/Manila';
alter table public.orders add column if not exists daily_number integer;
alter table public.orders add column if not exists order_date date;
create table if not exists public.daily_order_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_date date not null,
  last_number integer not null,
  primary key (tenant_id, order_date)
);
alter table public.daily_order_counters enable row level security;
revoke all on public.daily_order_counters from public, anon, authenticated;

create or replace function public.next_daily_order_number(p_tenant_id uuid, p_order_date date)
returns integer language plpgsql security definer set search_path = public as $$
declare next_number integer;
begin
  -- Seed from any previously numbered rows when importing an older deployment.
  insert into daily_order_counters(tenant_id, order_date, last_number)
  select p_tenant_id, p_order_date, coalesce(max(daily_number), 0) + 1
    from orders where tenant_id = p_tenant_id and order_date = p_order_date
  on conflict (tenant_id, order_date) do update
    set last_number = greatest(daily_order_counters.last_number + 1, excluded.last_number)
  returning last_number into next_number;
  return next_number;
end $$;
revoke all on function public.next_daily_order_number(uuid,date) from public,anon,authenticated;

create or replace function public.assign_daily_order_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare zone text;
begin
  select coalesce(timezone, 'Asia/Manila') into zone from tenants where id = new.tenant_id;
  new.order_date := (coalesce(new.created_at, now()) at time zone coalesce(zone, 'Asia/Manila'))::date;
  -- Never trust a caller-supplied display number or let it bypass the counter.
  new.daily_number := next_daily_order_number(new.tenant_id, new.order_date);
  return new;
end $$;
revoke all on function public.assign_daily_order_number() from public,anon,authenticated;
drop trigger if exists trg_assign_daily_order_number on public.orders;
create trigger trg_assign_daily_order_number before insert on public.orders
  for each row execute function public.assign_daily_order_number();
create unique index if not exists idx_orders_tenant_day_number
  on public.orders(tenant_id,order_date,daily_number) where daily_number is not null;
