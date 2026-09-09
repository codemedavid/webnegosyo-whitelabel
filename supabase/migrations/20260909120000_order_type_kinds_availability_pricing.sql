-- Order types: aggregator kinds, per-surface availability, POS pricing.
--
-- Merchants sell the same dish at different prices depending on how the order
-- arrives. Grab and foodpanda take a commission, so the register needs a higher
-- price for those channels than for a walk-in. Until now `order_types.type` was
-- locked to dine_in | pickup | delivery (CHECK + unique (tenant_id, type)),
-- nothing carried a per-order-type price, and every enabled order type showed on
-- every surface (web storefront, customer app, POS). This migration does three
-- things, all additive:
--
--   1. KINDS. Widens the CHECK to six kinds. `grab`, `foodpanda` and `other`
--      all behave like pickup (no address, no delivery fee, no radius); `other`
--      is a free-label, repeatable kind ("Shopee Food"). The old
--      unique (tenant_id, type) is replaced by a PARTIAL unique index over the
--      three core kinds only — a tenant still has at most one Dine In, one
--      Pick Up, one Delivery, but may have any number of `other` rows.
--      No `on conflict (tenant_id, type)` dependents exist (grepped), so
--      dropping the constraint breaks no upsert.
--
--   2. AVAILABILITY. `available_on_web` / `available_on_pos` default true, so
--      every existing row keeps appearing everywhere it did before. A CHECK
--      refuses turning both off: an order type nobody can pick is a mistake,
--      not a configuration.
--
--   3. POS PRICING. Opt-in per order type, register only. `pos_markup_percent`
--      NULL = store price (not zero — zero is a real "no markup" that a reader
--      may still want to display). `order_type_item_prices` holds EXACT
--      per-item overrides for one order type; it replaces the item's base price
--      only, modifiers still get the markup. NO ROW = markup applies (or store
--      price when the markup is NULL too). Resolution lives in
--      src/lib/order-types/order-type-pricing.ts (ported to webnegosyo-app).
--      Web storefront and the customer app never read these columns.
--
-- No backfill, no row is written on apply. Idempotent throughout.

-- ============================================
-- 1. Kinds: six, not three
-- ============================================
-- The CHECK name is auto-generated; probed live as `order_types_type_check`.
-- Guarded so a re-run (or a DB where the name drifted) does not error.
ALTER TABLE public.order_types
  DROP CONSTRAINT IF EXISTS order_types_type_check;
ALTER TABLE public.order_types
  ADD CONSTRAINT order_types_type_check
  CHECK (type IN ('dine_in', 'pickup', 'delivery', 'grab', 'foodpanda', 'other'));

-- Uniqueness moves from "one row per kind" to "one row per CORE kind".
ALTER TABLE public.order_types
  DROP CONSTRAINT IF EXISTS order_types_tenant_type_unique;
-- The constraint owned an index of the same name; belt and braces.
DROP INDEX IF EXISTS public.order_types_tenant_type_unique;
CREATE UNIQUE INDEX IF NOT EXISTS order_types_tenant_core_type_uq
  ON public.order_types(tenant_id, type)
  WHERE type IN ('dine_in', 'pickup', 'delivery');

COMMENT ON COLUMN public.order_types.type IS
  'dine_in | pickup | delivery are singletons per tenant (see '
  'order_types_tenant_core_type_uq). grab | foodpanda | other behave like '
  'pickup and may repeat; `other` is a free label such as "Shopee Food".';

-- ============================================
-- 2. Per-surface availability
-- ============================================
ALTER TABLE public.order_types
  ADD COLUMN IF NOT EXISTS available_on_web BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.order_types
  ADD COLUMN IF NOT EXISTS available_on_pos BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.order_types
  DROP CONSTRAINT IF EXISTS order_types_available_somewhere_ck;
ALTER TABLE public.order_types
  ADD CONSTRAINT order_types_available_somewhere_ck
  CHECK (available_on_web OR available_on_pos);

COMMENT ON COLUMN public.order_types.available_on_web IS
  'false = hidden from the web storefront and the customer app; the server '
  'also refuses orders placed against it online. Independent of is_enabled.';
COMMENT ON COLUMN public.order_types.available_on_pos IS
  'false = hidden from the merchant register (webnegosyo-app). At least one '
  'of available_on_web / available_on_pos must stay true.';

-- ============================================
-- 3. POS markup
-- ============================================
ALTER TABLE public.order_types
  ADD COLUMN IF NOT EXISTS pos_markup_percent NUMERIC(6,2);

ALTER TABLE public.order_types
  DROP CONSTRAINT IF EXISTS order_types_pos_markup_percent_ck;
ALTER TABLE public.order_types
  ADD CONSTRAINT order_types_pos_markup_percent_ck
  CHECK (pos_markup_percent IS NULL OR (pos_markup_percent >= -100 AND pos_markup_percent <= 500));

COMMENT ON COLUMN public.order_types.pos_markup_percent IS
  'Register-only percentage applied to base price AND modifiers when this '
  'order type is selected. NULL = store price. Range -100..500. Exact per-item '
  'overrides in order_type_item_prices replace the base price only.';

-- ============================================
-- 4. order_type_item_prices — one order type's exact price for one dish
-- ============================================
CREATE TABLE IF NOT EXISTS public.order_type_item_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised from the parents so RLS and every admin listing can filter by
  -- tenant without a join, the way outlet_menu_items does.
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_type_id UUID NOT NULL REFERENCES public.order_types(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  -- The exact register price of the item's BASE for this order type. Replaces
  -- the store price outright; the order type's markup is NOT applied on top.
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT order_type_item_prices_price_ck CHECK (price >= 0)
);

COMMENT ON TABLE public.order_type_item_prices IS
  'Exact per-item base-price overrides for one order type, register only. '
  'NO ROW = order_types.pos_markup_percent applies (or the store price when '
  'that is NULL). Resolution lives in src/lib/order-types/order-type-pricing.ts.';
COMMENT ON COLUMN public.order_type_item_prices.price IS
  'Exact base price on the register for this order type. Replaces the store '
  'price; modifiers still get pos_markup_percent.';

-- One opinion per order type per dish. Also the upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS order_type_item_prices_type_item_uq
  ON public.order_type_item_prices(order_type_id, menu_item_id);
-- The register reads every override for a tenant in one query and indexes it
-- in memory (order types x items-with-an-opinion, i.e. small).
CREATE INDEX IF NOT EXISTS order_type_item_prices_tenant_idx
  ON public.order_type_item_prices(tenant_id);
-- The item's admin view reads one dish across every order type.
CREATE INDEX IF NOT EXISTS order_type_item_prices_item_idx
  ON public.order_type_item_prices(menu_item_id);

DROP TRIGGER IF EXISTS set_order_type_item_prices_updated_at ON public.order_type_item_prices;
CREATE TRIGGER set_order_type_item_prices_updated_at
  BEFORE UPDATE ON public.order_type_item_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- 5. Row-level security
-- ============================================
ALTER TABLE public.order_type_item_prices ENABLE ROW LEVEL SECURITY;

-- Read is public, like outlet_menu_items_select_public. Nothing here is
-- sensitive: it is the price on the board, and the register reads it with the
-- signed-in merchant's session either way.
DROP POLICY IF EXISTS order_type_item_prices_select_public ON public.order_type_item_prices;
CREATE POLICY order_type_item_prices_select_public ON public.order_type_item_prices
  FOR SELECT
  USING (true);

-- Write mirrors order_types_write_admin (20260815130000): superadmin, or a
-- tenant admin of the row's own tenant. Order types are store-wide, so branch
-- scope does not apply here.
DROP POLICY IF EXISTS order_type_item_prices_write_admin ON public.order_type_item_prices;
CREATE POLICY order_type_item_prices_write_admin ON public.order_type_item_prices
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = order_type_item_prices.tenant_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = order_type_item_prices.tenant_id))
    )
  );

-- ============================================
-- 6. Integrity: an override must belong to its parents' tenant
-- ============================================
-- The FKs guarantee the order type and the item exist, not that they belong to
-- the tenant the row claims. A mismatched tenant_id would let one merchant's
-- price land on another's register, and RLS is written against that column.
CREATE OR REPLACE FUNCTION public.order_type_item_price_tenant_matches()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_type_tenant UUID;
  item_tenant UUID;
BEGIN
  SELECT ot.tenant_id INTO order_type_tenant FROM public.order_types ot WHERE ot.id = new.order_type_id;
  SELECT m.tenant_id INTO item_tenant FROM public.menu_items m WHERE m.id = new.menu_item_id;

  IF order_type_tenant IS DISTINCT FROM new.tenant_id THEN
    RAISE EXCEPTION 'order type % does not belong to tenant %', new.order_type_id, new.tenant_id;
  END IF;

  IF item_tenant IS DISTINCT FROM new.tenant_id THEN
    RAISE EXCEPTION 'menu item % does not belong to tenant %', new.menu_item_id, new.tenant_id;
  END IF;

  RETURN new;
END;
$$;

-- Trigger functions need no API-role EXECUTE: Postgres checks it when the
-- trigger is created, not when it fires (20260829140000).
REVOKE EXECUTE ON FUNCTION public.order_type_item_price_tenant_matches() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS order_type_item_prices_tenant_guard ON public.order_type_item_prices;
CREATE TRIGGER order_type_item_prices_tenant_guard
  BEFORE INSERT OR UPDATE ON public.order_type_item_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.order_type_item_price_tenant_matches();

-- Rollback:
-- DROP TRIGGER IF EXISTS order_type_item_prices_tenant_guard ON public.order_type_item_prices;
-- DROP FUNCTION IF EXISTS public.order_type_item_price_tenant_matches();
-- DROP TABLE IF EXISTS public.order_type_item_prices;
-- ALTER TABLE public.order_types DROP CONSTRAINT IF EXISTS order_types_pos_markup_percent_ck;
-- ALTER TABLE public.order_types DROP COLUMN IF EXISTS pos_markup_percent;
-- ALTER TABLE public.order_types DROP CONSTRAINT IF EXISTS order_types_available_somewhere_ck;
-- ALTER TABLE public.order_types DROP COLUMN IF EXISTS available_on_web;
-- ALTER TABLE public.order_types DROP COLUMN IF EXISTS available_on_pos;
-- DROP INDEX IF EXISTS public.order_types_tenant_core_type_uq;
-- -- Only safe once no grab/foodpanda/other rows remain:
-- ALTER TABLE public.order_types DROP CONSTRAINT IF EXISTS order_types_type_check;
-- ALTER TABLE public.order_types ADD CONSTRAINT order_types_type_check
--   CHECK (type IN ('dine_in', 'pickup', 'delivery'));
-- ALTER TABLE public.order_types ADD CONSTRAINT order_types_tenant_type_unique UNIQUE (tenant_id, type);
