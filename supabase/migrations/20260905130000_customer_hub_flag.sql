-- supabase/migrations/20260905130000_customer_hub_flag.sql
--
-- Per-tenant switch for the Customer Hub (repeat-rate overview, directory and
-- customer profiles built on the cross-backend order-facts projection added in
-- 20260905120000_customer_order_facts.sql).
--
-- Why a flag at all: the Hub's numbers are only as good as a tenant's ledger
-- coverage, and for Convex / tenant-Supabase stores that ledger is still filling
-- in as lifecycle sync reaches their devices. Showing a confident repeat rate
-- computed from a half-filled ledger would be worse than showing nothing, so the
-- Hub is enabled per store once its coverage has been checked.
--
-- Defaults to FALSE for exactly that reason: this is a pilot switch, not a
-- behaviour-preserving one. Nothing is taken away from any tenant by defaulting
-- off, because the Hub does not exist yet.
--
-- Safety / reversibility: purely additive, one defaulted boolean. Rollback at
-- the bottom.

alter table public.tenants
  add column if not exists customer_hub_enabled boolean not null default false;

comment on column public.tenants.customer_hub_enabled is
  'Enables the merchant Customer Hub (repeat rate, directory, customer profiles). Defaults false: a pilot switch flipped per store once its customer-ledger coverage has been checked.';

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   alter table public.tenants drop column if exists customer_hub_enabled;
-- ------------------------------------------------------------------------------
