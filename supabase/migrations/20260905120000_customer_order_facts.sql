-- supabase/migrations/20260905120000_customer_order_facts.sql
--
-- Give the external-order ledger enough lifecycle truth to compute customer
-- intelligence and, later, loyalty earning.
--
-- The defect: `customer_external_orders` (20260726120000) records only WHO,
-- HOW MUCH, WHEN and WHICH ITEMS. It is written once, best-effort, at order
-- CREATE time and never touched again. So on a Convex or tenant-Supabase
-- backend the platform cannot tell a cancelled order from a delivered one, a
-- settled POS sale from an open ticket, or which branch a visit belongs to.
-- Every derived number — repeat rate, cadence, favourite item — therefore
-- counts orders that never happened, and no loyalty program can qualify an
-- order without that same lifecycle truth.
--
-- The fix: five columns carrying exactly the lifecycle facts the Customer Hub
-- and loyalty qualification need, and nothing more. This table is still NOT an
-- order mirror: no addresses, no payment instruments, no fulfilment workflow.
-- Each tenant's own backend remains the source of truth for fulfilment; these
-- columns are a projection of it, kept fresh by an idempotent lifecycle sync.
--
-- Safety / reversibility: purely additive. Five nullable-or-defaulted columns
-- and one index on an existing table; no column changes type, no row data is
-- rewritten, and every existing reader keeps working untouched. Safe to apply
-- online and ahead of any deploy. Manual rollback at the bottom.
--
-- Access model: unchanged. The table's RLS was corrected in
-- 20260726140000_fix_tenant_isolation_rls.sql to compare the caller's tenant to
-- THE ROW's tenant_id; these columns inherit that and need no new policy.

-- 1. Lifecycle columns ----------------------------------------------------------

-- Which register the sale came from. Loyalty qualifies POS at settlement but a
-- non-POS order only at delivery/collection, so the two cannot share a rule and
-- the distinction has to be stored, not guessed from the channel string.
-- Defaults to 'online' because every row written before this migration came
-- from a customer-facing checkout.
alter table public.customer_external_orders
  add column if not exists source text not null default 'online';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_external_orders_source_ck'
  ) then
    alter table public.customer_external_orders
      add constraint customer_external_orders_source_ck
      check (source in ('pos', 'online'));
  end if;
end $$;

-- Fulfilment and payment state, as the owning backend last reported them.
-- Deliberately free-text rather than an enum: the three backends are deployed
-- independently and a tenant on an older Convex bundle can still report a
-- status this platform build has never heard of. A value we do not recognise
-- must read as "not yet qualified", never as an error.
alter table public.customer_external_orders
  add column if not exists status text;

alter table public.customer_external_orders
  add column if not exists payment_status text;

-- Which branch the visit belongs to. Nullable: single-branch tenants have no
-- outlet, and a multi-branch tenant's older orders predate branch capture.
-- ON DELETE SET NULL — closing a branch must not erase its customers' history.
alter table public.customer_external_orders
  add column if not exists outlet_id uuid references public.outlets(id) on delete set null;

-- When the order actually completed, which is NOT when it was placed. A visit
-- belongs to the day it was fulfilled, so every window in the Customer Hub
-- measures from this when it is known and falls back to ordered_at when it is
-- not.
alter table public.customer_external_orders
  add column if not exists completed_at timestamptz;

-- 2. Index ----------------------------------------------------------------------
-- The Hub's 7/30/90-day windows scan one tenant's recent completed orders.
create index if not exists customer_external_orders_tenant_completed_idx
  on public.customer_external_orders(tenant_id, completed_at desc)
  where completed_at is not null;

-- 3. Documentation --------------------------------------------------------------
comment on column public.customer_external_orders.source is
  'Which register produced the sale: pos | online. Loyalty qualifies a POS sale at settlement and a non-POS order only at delivery/collection, so the two cannot share a rule.';
comment on column public.customer_external_orders.status is
  'Fulfilment status as the owning backend last reported it (pending|confirmed|preparing|ready|delivered|cancelled). Free-text on purpose: an unrecognised value must read as "not yet qualified", never as an error.';
comment on column public.customer_external_orders.payment_status is
  'Payment state as the owning backend last reported it (pending|paid|failed|verified). Free-text for the same reason as status.';
comment on column public.customer_external_orders.outlet_id is
  'Branch the visit belongs to; null for single-branch tenants and for orders placed before branch capture existed.';
comment on column public.customer_external_orders.completed_at is
  'When the order was actually fulfilled, not when it was placed. Null until it completes; readers fall back to ordered_at.';

-- The items shape gains an optional menu item id. Convex orderItems always
-- carry menuItemId; platform/tenant order_items.menu_item_id is nullable and
-- becomes null when a menu item is deleted. Readers key on the id when present
-- and on a normalized name otherwise, so both shapes stay rankable forever.
comment on column public.customer_external_orders.items is
  'JSON array of line items used for the customer''s top-items tally: [{ "name": string, "quantity": number, "menuItemId"?: string }]. menuItemId is optional — legacy rows and deleted menu items have only a name.';

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   drop index if exists public.customer_external_orders_tenant_completed_idx;
--   alter table public.customer_external_orders
--     drop constraint if exists customer_external_orders_source_ck,
--     drop column if exists source,
--     drop column if exists status,
--     drop column if exists payment_status,
--     drop column if exists outlet_id,
--     drop column if exists completed_at;
-- ------------------------------------------------------------------------------
