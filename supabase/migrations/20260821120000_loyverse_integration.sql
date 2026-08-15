-- Loyverse POS integration — Phase 1 foundation.
--
-- Loyverse (developer.loyverse.com) becomes an optional per-tenant catalog /
-- sales-reporting backend: the merchant's Loyverse catalog syncs INTO
-- menu_items, and orders push OUT as completed receipts (`POST /receipts`).
-- Loyverse has no open-ticket API, so the "order rings the register" flow
-- stays on our side; Loyverse only ever receives finished sales.
--
-- Purely additive: tenant columns, order columns, one new mapping table.
-- No renames, no drops, no type changes. Inert on apply — every column
-- defaults to the integration being off, and the mapping table starts empty.

-- ============================================
-- 1. tenants — connection + behaviour settings
-- ============================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS loyverse_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loyverse_access_token text,
  ADD COLUMN IF NOT EXISTS loyverse_store_id text,
  ADD COLUMN IF NOT EXISTS loyverse_payment_type_id text,
  -- 'on_create' = push the receipt the moment the customer places the order;
  -- 'on_confirm' = only after a human confirms it. Unknown values are coerced
  -- to 'on_confirm' in code (src/lib/loyverse/config.ts) — conservative default.
  ADD COLUMN IF NOT EXISTS loyverse_push_mode text NOT NULL DEFAULT 'on_confirm',
  ADD COLUMN IF NOT EXISTS loyverse_last_synced_at timestamptz;

COMMENT ON COLUMN public.tenants.loyverse_access_token IS
  'Loyverse Personal Access Token (Back Office -> Integrations -> Access tokens). Server-side only; never selected by storefront queries.';
COMMENT ON COLUMN public.tenants.loyverse_store_id IS
  'Loyverse store the tenant maps to: receipts are created here and per-store prices are read from it.';
COMMENT ON COLUMN public.tenants.loyverse_payment_type_id IS
  'Loyverse payment type recorded on pushed receipts. NULL = push receipts without a payment line.';

-- ============================================
-- 2. orders — push outcome per order (mirrors the lalamove_* columns)
-- ============================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyverse_receipt_number text,
  ADD COLUMN IF NOT EXISTS loyverse_push_status text,
  ADD COLUMN IF NOT EXISTS loyverse_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS loyverse_push_error text;

COMMENT ON COLUMN public.orders.loyverse_receipt_number IS
  'Server-assigned Loyverse receipt number once pushed. Presence = already pushed (idempotency guard).';
COMMENT ON COLUMN public.orders.loyverse_push_status IS
  'pending | pushed | failed | skipped. NULL = tenant does not use Loyverse or order predates the integration.';

-- ============================================
-- 3. loyverse_item_map — which local menu row a Loyverse variant/modifier is
-- ============================================
-- menu_items has no external-id column, and one Loyverse ITEM fans out into
-- one menu_item plus N variant rows (its option matrix) and M modifier
-- options. Receipt lines need the loyverse_variant_id / modifier_option_id
-- for the exact thing sold, so the map is per-variant, not per-item.
CREATE TABLE IF NOT EXISTS public.loyverse_item_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- 'variant' rows point at a menu_item (+ optional local variation key);
  -- 'modifier_option' rows map a Loyverse modifier option to a local
  -- modifier/addon option and carry no menu_item.
  kind text NOT NULL CHECK (kind IN ('variant', 'modifier_option')),
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  -- Local identifier inside the menu item's JSON (variation option name/id or
  -- modifier option key). '' for the item's base/default variant.
  local_key text NOT NULL DEFAULT '',
  loyverse_item_id text,
  loyverse_variant_id text,
  loyverse_modifier_id text,
  loyverse_modifier_option_id text,
  loyverse_sku text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS loyverse_item_map_variant_uniq
  ON public.loyverse_item_map (tenant_id, loyverse_variant_id)
  WHERE kind = 'variant';
CREATE UNIQUE INDEX IF NOT EXISTS loyverse_item_map_modifier_option_uniq
  ON public.loyverse_item_map (tenant_id, loyverse_modifier_option_id)
  WHERE kind = 'modifier_option';
CREATE INDEX IF NOT EXISTS loyverse_item_map_menu_item_idx
  ON public.loyverse_item_map (tenant_id, menu_item_id);

ALTER TABLE public.loyverse_item_map ENABLE ROW LEVEL SECURITY;

-- Not public: the storefront never reads the map (sync and receipt push are
-- server-side with the service key, which bypasses RLS). Admin reads are
-- tenant-scoped for debugging screens; writes mirror the same scope.
DROP POLICY IF EXISTS loyverse_item_map_rw_admin ON public.loyverse_item_map;
CREATE POLICY loyverse_item_map_rw_admin ON public.loyverse_item_map
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (au.role = 'admin' AND au.tenant_id = loyverse_item_map.tenant_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (au.role = 'admin' AND au.tenant_id = loyverse_item_map.tenant_id)
        )
    )
  );
