-- Platform `orders` / `order_items` columns needed for Convex parity.
--
-- The merchant app's order screens read a DTO shaped by Convex's `orders`
-- table. The shared platform tables were built for the web checkout only and
-- are missing the fields the app depends on. Without them a platform tenant
-- cannot:
--   * ring up a counter sale     -> no `source`, so POS/QR orders are
--                                   indistinguishable from web orders and
--                                   cannot skip the pending queue
--   * dedupe a retried submit    -> no `client_order_id`, so a flaky network on
--                                   checkout double-charges the customer
--   * render the queue cards     -> no `item_count`
--   * report upsell/bundle lift  -> no per-order or per-item flags
--
-- Mirrors `convex-template/convex/orders.ts` and the mapper contract in
-- `webnegosyo-app/lib/backends/supabase-orders.ts`.
--
-- All columns are nullable or defaulted, so existing web-checkout writes keep
-- working untouched. In Postgres 11+ adding a defaulted column is a metadata-
-- only change, so this does not rewrite the table.

-- ---------------------------------------------------------------------------
-- 1. orders
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists source text not null default 'web',
  add column if not exists client_order_id text,
  add column if not exists item_count integer,
  add column if not exists has_upsell_items boolean not null default false,
  add column if not exists has_bundle_items boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_source_ck'
  ) then
    alter table public.orders
      add constraint orders_source_ck
      check (source in ('web', 'mobile', 'qr_handoff', 'pos'));
  end if;
end $$;

-- Idempotency guard for order submission. Scoped per tenant: the id is
-- generated on the client, so two tenants could independently mint the same
-- one, and a global unique index would reject the second tenant's real order.
-- Partial, because existing rows have no client id and NULLs must not collide.
create unique index if not exists orders_tenant_client_order_id_uq
  on public.orders (tenant_id, client_order_id)
  where client_order_id is not null;

create index if not exists orders_tenant_created_idx
  on public.orders (tenant_id, created_at desc);
create index if not exists orders_tenant_status_created_idx
  on public.orders (tenant_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. order_items
-- ---------------------------------------------------------------------------
-- `addons` stays a text[] — the web checkout already writes that shape and the
-- mapper normalizes both forms. Changing the type would break existing writers
-- for no gain.
alter table public.order_items
  add column if not exists variation_selections jsonb,
  add column if not exists is_upsell_item boolean not null default false,
  add column if not exists is_bundle_item boolean not null default false,
  add column if not exists bundle_id uuid,
  add column if not exists bundle_name text,
  add column if not exists slot_name text;

create index if not exists order_items_order_idx
  on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill item_count for existing orders
-- ---------------------------------------------------------------------------
-- Left null, every historical order would render "0 items" on the queue card.
update public.orders o
set item_count = coalesce(sums.total_quantity, 0)
from (
  select order_id, sum(quantity)::int as total_quantity
  from public.order_items
  group by order_id
) sums
where sums.order_id = o.id
  and o.item_count is null;

-- Orders with no line items at all (legacy/partial writes) still need a number.
update public.orders
set item_count = 0
where item_count is null;
