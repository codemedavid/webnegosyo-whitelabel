-- supabase/migrations/20260819120000_customers_manual_creation.sql
--
-- Let a merchant create a customer by hand, and tell those rows apart.
--
-- Until now every row in `customers` was derived from an order: the checkout
-- path resolved an identity and the service role upserted a profile. That made
-- one property free which stops being free the moment a merchant can type a
-- guest in at the counter — a row with `order_count = 0` could only ever be a
-- bug (a failed backfill, an order that vanished), so it was safe to treat as
-- one. A hand-entered guest who has not ordered yet looks identical, and
-- without a discriminator the two are impossible to tell apart in any report.
--
-- `created_source` is that discriminator. `notes` is the field merchants
-- actually ask for first: "allergic to shrimp", "always calls ahead".
--
-- Safety / reversibility: purely additive — two new columns on one table, one
-- with a default and one nullable. No existing column changes type, no row data
-- is rewritten, and no policy changes. Safe to apply online. Rollback block is
-- at the bottom.

-- 1. Where the row came from -----------------------------------------------------
-- Default 'order' is correct for every pre-existing row: before this migration
-- the derived path was the only writer that existed.
alter table public.customers
  add column if not exists created_source text not null default 'order';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_created_source_ck'
  ) then
    alter table public.customers
      add constraint customers_created_source_ck
      check (created_source in ('order', 'manual', 'import'));
  end if;
end $$;

-- 2. Merchant's own notes on the guest --------------------------------------------
alter table public.customers
  add column if not exists notes text;

-- 3. Documentation -----------------------------------------------------------------
comment on column public.customers.created_source is
  'How this profile came to exist: ''order'' (derived from an order — the only source before 2026-08), ''manual'' (typed in by the merchant), ''import'' (bulk load). Distinguishes a genuinely new hand-entered guest from a derived row whose order rollup failed, since both have order_count = 0.';
comment on column public.customers.notes is
  'Free-text notes the merchant keeps on this guest (allergies, preferences). Merchant-authored, never derived from orders.';

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   alter table public.customers drop constraint if exists customers_created_source_ck;
--   alter table public.customers drop column if exists created_source;
--   alter table public.customers drop column if exists notes;
-- ------------------------------------------------------------------------------
