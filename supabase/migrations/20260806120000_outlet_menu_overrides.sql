-- Per-branch menu and pricing — the table `20260730120000` reserved.
--
-- That migration said, in its own words: "outlets carry NO menu, price, or
-- stock columns. In Phase 1 all branches of a tenant share one menu. Per-branch
-- menus/pricing/stock arrive later as separate tables keyed on outlet_id, so
-- they never require altering this one." This is that table.
--
-- OVERRIDE-ONLY, OPT-OUT SEMANTICS. The absence of a row means "this branch
-- lists this dish at the store-wide price" — which is precisely what every
-- branch does today. So there is no backfill, no row is written on apply, and
-- a tenant that never opens the new admin screens behaves exactly as it does
-- now. It also fixes the direction of the failure mode: a dish added to the
-- menu and never assigned to a branch appears everywhere (over-listed, and
-- visible to the owner) rather than nowhere (invisible lost revenue).
--
-- The alternative — an explicit assignment table — would require inserting
-- items x branches rows for every existing multi-branch tenant before their
-- menu rendered at all, and would make "new dish is invisible" the default.
--
-- Purely additive: one new table. No renames, no drops, no type changes.

-- ============================================
-- 1. outlet_menu_items — one branch's opinion about one dish
-- ============================================
CREATE TABLE IF NOT EXISTS public.outlet_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised from the parents so RLS and every admin listing can filter by
  -- tenant without a join, the way `orders` and `app_users` already do.
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,

  -- Is the dish on this branch's menu AT ALL. false = the branch does not carry
  -- it; the customer never sees it. This is the "we don't do that here" case.
  is_listed BOOLEAN NOT NULL DEFAULT true,

  -- Is the dish orderable at this branch RIGHT NOW. false = listed but 86'd,
  -- shown greyed out by the card template. Same meaning `menu_items.is_available`
  -- carries store-wide since `manual out-of-stock` — see
  -- src/lib/menu-item-availability.ts — so the two compose: unavailable
  -- store-wide stays unavailable everywhere regardless of this column.
  is_available BOOLEAN NOT NULL DEFAULT true,

  -- NULL = inherit `menu_items.price`. Not zero — zero is a real free item.
  price NUMERIC(10,2),
  -- NULL = inherit `menu_items.discounted_price`, WHICH MAY ITSELF BE NULL.
  discounted_price NUMERIC(10,2),
  -- Which is why this exists. NULL discounted_price cannot distinguish "this
  -- branch has no opinion, use the store-wide sale price" from "this branch is
  -- NOT running the store-wide sale". true means the latter: the branch sells
  -- at full price while the rest of the chain discounts. Without it a branch
  -- could never opt out of a promotion.
  discount_cleared BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT outlet_menu_items_price_ck
    CHECK (price IS NULL OR price >= 0),
  CONSTRAINT outlet_menu_items_discount_ck
    CHECK (discounted_price IS NULL OR discounted_price >= 0),
  -- A cleared discount and an explicit one are contradictory instructions, and
  -- whichever the reader honoured would surprise the other half of the app.
  CONSTRAINT outlet_menu_items_discount_exclusive_ck
    CHECK (NOT (discount_cleared AND discounted_price IS NOT NULL))
);

COMMENT ON TABLE public.outlet_menu_items IS
  'Per-branch overrides of a menu item. NO ROW = listed and available at the '
  'store-wide price, which is what every branch did before this table existed. '
  'Resolution lives in src/lib/outlets/outlet-menu-overrides.ts.';

COMMENT ON COLUMN public.outlet_menu_items.is_listed IS
  'false = this branch does not carry the dish; it is absent from the menu.';
COMMENT ON COLUMN public.outlet_menu_items.is_available IS
  'false = listed but currently unorderable at this branch (86''d). Composes '
  'with menu_items.is_available, which still wins when false.';
COMMENT ON COLUMN public.outlet_menu_items.discount_cleared IS
  'true = this branch opts OUT of the store-wide discounted_price. Needed '
  'because a NULL discounted_price already means "inherit".';

-- One opinion per branch per dish. Also the index the upsert conflict target
-- and every per-branch lookup use.
CREATE UNIQUE INDEX IF NOT EXISTS outlet_menu_items_outlet_item_uq
  ON public.outlet_menu_items(outlet_id, menu_item_id);
-- The storefront reads every override for a tenant in one query, then indexes
-- them in memory (the table is items x branches-with-an-opinion, i.e. small).
CREATE INDEX IF NOT EXISTS outlet_menu_items_tenant_idx
  ON public.outlet_menu_items(tenant_id);
-- The item's "Branches" tab reads one dish across every branch.
CREATE INDEX IF NOT EXISTS outlet_menu_items_item_idx
  ON public.outlet_menu_items(menu_item_id);

DROP TRIGGER IF EXISTS set_outlet_menu_items_updated_at ON public.outlet_menu_items;
CREATE TRIGGER set_outlet_menu_items_updated_at
  BEFORE UPDATE ON public.outlet_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- 2. Row-level security
-- ============================================
ALTER TABLE public.outlet_menu_items ENABLE ROW LEVEL SECURITY;

-- Read is public, like `outlets_select_public` and `menu_items_read_available`.
-- The storefront is unauthenticated and cannot price a branch menu without it.
-- Nothing here is sensitive: it is the price on the board outside the shop.
DROP POLICY IF EXISTS outlet_menu_items_select_public ON public.outlet_menu_items;
CREATE POLICY outlet_menu_items_select_public ON public.outlet_menu_items
  FOR SELECT
  USING (true);

-- Write mirrors `menu_items_write_admin` PLUS the branch rule established by
-- `20260804130000`: a store-wide admin manages any branch's menu; a
-- branch-scoped admin (app_users.outlet_id IS NOT NULL) manages ONLY its own
-- branch. A branch manager 86'ing a dish at its own shop is the point of the
-- feature; doing it at a shop it does not run is not.
--
-- Inert on apply for exactly the reason that migration was: no override row
-- exists yet, and store-wide admins are unaffected.
DROP POLICY IF EXISTS outlet_menu_items_write_admin ON public.outlet_menu_items;
CREATE POLICY outlet_menu_items_write_admin ON public.outlet_menu_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (
            au.role = 'admin'
            AND au.tenant_id = outlet_menu_items.tenant_id
            AND (au.outlet_id IS NULL OR au.outlet_id = outlet_menu_items.outlet_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (
            au.role = 'admin'
            AND au.tenant_id = outlet_menu_items.tenant_id
            AND (au.outlet_id IS NULL OR au.outlet_id = outlet_menu_items.outlet_id)
          )
        )
    )
  );

COMMENT ON POLICY outlet_menu_items_write_admin ON public.outlet_menu_items IS
  'Store-wide admins manage every branch''s menu; a branch-scoped admin manages '
  'only its own branch. Mirrors the branch rule in '
  '20260804130000_outlets_write_store_wide_only.sql.';

-- ============================================
-- 3. Integrity: an override must belong to its parents' tenant
-- ============================================
-- The FKs guarantee the outlet and the item exist, not that they belong to the
-- same tenant as the row claims. A mismatched tenant_id would leak one
-- merchant's price onto another's menu, and RLS is written against that column.
CREATE OR REPLACE FUNCTION public.outlet_menu_item_tenant_matches()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  outlet_tenant UUID;
  item_tenant UUID;
BEGIN
  SELECT o.tenant_id INTO outlet_tenant FROM public.outlets o WHERE o.id = new.outlet_id;
  SELECT m.tenant_id INTO item_tenant FROM public.menu_items m WHERE m.id = new.menu_item_id;

  IF outlet_tenant IS DISTINCT FROM new.tenant_id THEN
    RAISE EXCEPTION 'outlet % does not belong to tenant %', new.outlet_id, new.tenant_id;
  END IF;

  IF item_tenant IS DISTINCT FROM new.tenant_id THEN
    RAISE EXCEPTION 'menu item % does not belong to tenant %', new.menu_item_id, new.tenant_id;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS outlet_menu_items_tenant_guard ON public.outlet_menu_items;
CREATE TRIGGER outlet_menu_items_tenant_guard
  BEFORE INSERT OR UPDATE ON public.outlet_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.outlet_menu_item_tenant_matches();

-- Rollback:
-- DROP TRIGGER IF EXISTS outlet_menu_items_tenant_guard ON public.outlet_menu_items;
-- DROP FUNCTION IF EXISTS public.outlet_menu_item_tenant_matches();
-- DROP TABLE IF EXISTS public.outlet_menu_items;
