-- Multi-branch (multi-outlet) storefront — Phase 1 foundations.
--
-- Purely additive: one new table, one nullable tenants flag defaulting to
-- false, and one nullable column on orders. No renames, no drops, no type
-- changes, and no backfill — every existing row keeps its current meaning.
-- With `multi_branch_enabled` false (the default, and the value every existing
-- tenant gets) nothing in this migration is read by the application.
--
-- Scope note: outlets carry NO menu, price, or stock columns. In Phase 1 all
-- branches of a tenant share one menu. Per-branch menus/pricing/stock arrive
-- later as separate tables keyed on outlet_id, so they never require altering
-- this one.

-- ============================================
-- 0. Feature flag
-- ============================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS multi_branch_enabled BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN tenants.multi_branch_enabled IS
  'Opt-in: storefront asks the customer to choose a branch. Off = today''s single-location flow.';

-- ============================================
-- 1. outlets — the branches themselves
-- ============================================
CREATE TABLE IF NOT EXISTS outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- URL-safe identifier used by ?outlet={slug} and /b/{slug}. Application-side
  -- validation (src/lib/outlets/reserved-slugs.ts) additionally rejects slugs
  -- that collide with real route segments; the DB only enforces shape+uniqueness.
  slug TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone TEXT,
  -- Same shape as tenants.operating_hours: {"0".."6": {closed, open, close}},
  -- so src/lib/store-open-status.ts evaluates a branch with the same code.
  operating_hours JSONB,
  timezone TEXT,
  supports_pickup BOOLEAN NOT NULL DEFAULT true,
  supports_delivery BOOLEAN NOT NULL DEFAULT true,
  -- Null or zero = unrestricted. Phase 1 uses this to match a customer to a
  -- branch only; delivery FEE pricing still uses the tenant-level config.
  delivery_radius_km NUMERIC(8,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT outlets_name_not_blank_ck CHECK (btrim(name) <> ''),
  CONSTRAINT outlets_slug_format_ck CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT outlets_slug_length_ck CHECK (char_length(slug) BETWEEN 2 AND 40),
  CONSTRAINT outlets_latitude_range_ck CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT outlets_longitude_range_ck CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  -- Half a coordinate pair silently disables nearest-branch detection for this
  -- branch, which reads as a broken feature rather than incomplete data.
  CONSTRAINT outlets_coordinates_paired_ck CHECK (
    (latitude IS NULL) = (longitude IS NULL)
  ),
  CONSTRAINT outlets_radius_non_negative_ck CHECK (
    delivery_radius_km IS NULL OR delivery_radius_km >= 0
  ),
  -- A branch that does neither cannot be chosen for anything.
  CONSTRAINT outlets_fulfillment_ck CHECK (supports_pickup OR supports_delivery)
);

COMMENT ON TABLE outlets IS
  'Physical branches of a multi-branch tenant. Only read when tenants.multi_branch_enabled is true.';

CREATE INDEX IF NOT EXISTS idx_outlets_tenant_id ON outlets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outlets_tenant_active ON outlets(tenant_id, is_active);
-- Slugs are matched case-insensitively from URLs; the index enforces that.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outlets_tenant_slug_uq ON outlets(tenant_id, lower(slug));

-- keep updated_at honest (same trigger function the other tables use)
DROP TRIGGER IF EXISTS set_outlets_updated_at ON outlets;
CREATE TRIGGER set_outlets_updated_at
  BEFORE UPDATE ON outlets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. orders.outlet_id — which branch fulfills an order
-- ============================================
-- Nullable with no default and no backfill: NULL means "single-location tenant"
-- and describes every order that exists today. Every current query keeps
-- working unchanged. ON DELETE SET NULL so removing a branch never destroys
-- order history.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL;
COMMENT ON COLUMN orders.outlet_id IS
  'Branch that fulfills this order. NULL = single-location tenant (all pre-multi-branch orders).';

-- Partial index: the overwhelming majority of rows are NULL and never queried
-- by branch, so only the multi-branch rows are worth indexing.
CREATE INDEX IF NOT EXISTS idx_orders_outlet_id ON orders(outlet_id) WHERE outlet_id IS NOT NULL;

-- ============================================
-- 3. RLS
-- ============================================
-- Reads are public: the storefront shows branches to anonymous customers,
-- exactly like menu_items and categories. Writes are tenant-admin or
-- superadmin only, matching the corrected policy shape from
-- 20260726140000_fix_tenant_isolation_rls.sql (note the comparison is against
-- the ROW's tenant_id — comparing au.tenant_id to itself is the bug that
-- migration fixed).
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlets_select_public ON public.outlets;
CREATE POLICY outlets_select_public ON public.outlets
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS outlets_write_admin ON public.outlets;
CREATE POLICY outlets_write_admin ON public.outlets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (au.role = 'admin' AND au.tenant_id = outlets.tenant_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (au.role = 'admin' AND au.tenant_id = outlets.tenant_id)
        )
    )
  );

-- ============================================
-- Rollback (manual)
-- ============================================
-- DROP INDEX IF EXISTS idx_orders_outlet_id;
-- ALTER TABLE orders DROP COLUMN IF EXISTS outlet_id;
-- DROP TABLE IF EXISTS outlets;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS multi_branch_enabled;
