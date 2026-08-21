-- Loyverse sync: give menu_items a durable external identity.
--
-- THE BUG THIS FIXES
-- Until now the ONLY link between a Loyverse item and its local menu row was
-- the `loyverse_item_map` side table, which `importLoyverseCatalog` rebuilds
-- destructively (delete-all + batch-insert) AFTER its per-item loop. The loop
-- mirrors an image per item, so a large catalog can outrun the function
-- timeout — leaving menu_items created and ZERO map rows. The merchant's next
-- sync then matched nothing and inserted the whole catalog a second time.
--
-- Identity belongs on the row it identifies. With `loyverse_item_id` on
-- menu_items the match key is written in the same statement that creates the
-- dish, so a half-finished sync is merely incomplete, never duplicating. The
-- partial UNIQUE index makes a duplicate impossible at the database level
-- rather than merely unlikely in application code.
--
-- Purely additive: one nullable column, one partial unique index, one
-- nullable column on the map table. Backfilled from the existing map, so
-- tenants already synced keep their matches.

-- ============================================
-- 1. menu_items — the external identity
-- ============================================
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS loyverse_item_id text;

COMMENT ON COLUMN public.menu_items.loyverse_item_id IS
  'Loyverse item id this dish was synced from. NULL = locally authored (the vast majority). Written by src/lib/loyverse/catalog-import.ts; the match key that makes re-sync idempotent.';

-- Backfill from the map so already-synced tenants are matched on their very
-- next sync instead of duplicating once more.
--
-- DISTINCT ON guards the one case that would abort the migration: a tenant
-- whose menu already contains duplicates has several menu rows competing for
-- one Loyverse id. Only the earliest-created row is claimed; the duplicates
-- keep loyverse_item_id NULL and are left for scripts/loyverse-dedupe.ts to
-- report on. A NULL never violates the partial index below.
UPDATE public.menu_items AS mi
SET loyverse_item_id = claim.loyverse_item_id
FROM (
  SELECT DISTINCT ON (m.tenant_id, m.loyverse_item_id)
    m.menu_item_id,
    m.loyverse_item_id
  FROM public.loyverse_item_map AS m
  JOIN public.menu_items AS target ON target.id = m.menu_item_id
  WHERE m.kind = 'variant'
    AND m.menu_item_id IS NOT NULL
    AND m.loyverse_item_id IS NOT NULL
  ORDER BY m.tenant_id, m.loyverse_item_id, target.created_at ASC, target.id ASC
) AS claim
WHERE mi.id = claim.menu_item_id
  AND mi.loyverse_item_id IS NULL;

-- One local dish per Loyverse item per tenant. Partial, so the millions of
-- locally authored rows (loyverse_item_id IS NULL) are unaffected — NULLs are
-- excluded from the index entirely rather than colliding with each other.
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_tenant_loyverse_item_uniq
  ON public.menu_items (tenant_id, loyverse_item_id)
  WHERE loyverse_item_id IS NOT NULL;

-- ============================================
-- 2. loyverse_item_map — remembered per-variant stock
-- ============================================
-- `inventory_levels.update` webhooks arrive as one delta per variant. Deciding
-- whether a multi-variant dish is out of stock needs the CURRENT state of its
-- other variants, which a single delta does not carry. Without this column the
-- old code compared the batch against every mapped variant, so a two-size dish
-- could essentially never be 86'd — losing its last size left it orderable.
--
-- NULL = stock unknown (never reported, or Loyverse does not track this
-- variant). Unknown must read as "still sellable", never as out of stock.
ALTER TABLE public.loyverse_item_map
  ADD COLUMN IF NOT EXISTS in_stock numeric;

COMMENT ON COLUMN public.loyverse_item_map.in_stock IS
  'Last known Loyverse stock level for this variant at the tenant''s mapped store. NULL = unknown/untracked, which counts as available. Maintained by src/lib/loyverse/inventory-sync.ts.';
