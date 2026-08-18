-- =============================================================================
-- Platform-backend push notifications
-- =============================================================================
-- Convex tenants ring merchant devices from inside their deployment's
-- createOrder. Platform-backend tenants had no equivalent: `push_tokens`
-- existed but nothing wrote to it and nothing sent. This migration completes
-- the loop:
--
--   app registers device --> public.push_tokens (now branch-aware)
--   any INSERT into public.orders --> trigger --> pg_net POST to the web app's
--   /api/push/notify-order --> Expo push to the order's branch
--
-- The trigger fires for every write path (web checkout, mobile POS adapter,
-- QR-handoff accept) precisely because it lives on the table, not in a caller.
-- The route re-reads the order with the service role and claims a once-only
-- row in order_push_notifications, so the payload here carries ids only and a
-- replay cannot ring twice.
-- =============================================================================

-- 1. Branch-aware tokens. Null = store-wide (owners, older app builds), which
--    must keep hearing everything. on delete set null: a deleted branch
--    degrades its devices to store-wide — toward noise, never silence.
alter table public.push_tokens
  add column if not exists outlet_id uuid references public.outlets(id) on delete set null;

-- 2. Once-only send claim per order. Service-role only: RLS enabled with no
--    policies, so neither merchants nor anon can read or forge claims.
create table if not exists public.order_push_notifications (
  order_id uuid primary key references public.orders(id) on delete cascade,
  tenant_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.order_push_notifications enable row level security;

-- 3. Async HTTP from the trigger.
create extension if not exists pg_net with schema extensions;

-- 4. Fan-out trigger. pg_net is async (it queues the request), so the INSERT
--    itself never waits on the web app; the exception guard means a broken
--    queue can still never block an order from being written.
create or replace function public.notify_order_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://www.webnegosyo.com/api/push/notify-order',
    body := jsonb_build_object('order_id', new.id, 'tenant_id', new.tenant_id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists orders_notify_push on public.orders;
create trigger orders_notify_push
  after insert on public.orders
  for each row execute function public.notify_order_push();
