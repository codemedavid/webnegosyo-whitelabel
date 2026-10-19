-- Branding Studio: Order status + Loyalty card editors
-- (docs/plans/2026-10-19-studio-tracking-loyalty.md).
--
-- tracking_style: the owner's look for the order-tracking page and the loyalty
-- stamp card, key → value, e.g. {"hero_color": "#e4572e", "hero_style": "solid",
-- "show_timeline": false}. A missing key keeps today's brand-derived look.
-- Keys, hex colours and choices are validated by the app (zod,
-- src/lib/tracking-style/keys.ts) and re-validated on every read, so bad data
-- degrades to today's look, never an error.
--
-- Owner-editable branding (no privileged-column guard), like storefront_labels.
-- Constant default: added as metadata only, no table rewrite. The size check
-- keeps a single tenant row from growing without bound.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tracking_style jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_tracking_style_object,
  ADD CONSTRAINT tenants_tracking_style_object
    CHECK (jsonb_typeof(tracking_style) = 'object' AND pg_column_size(tracking_style) <= 8192);

COMMENT ON COLUMN tenants.tracking_style IS
  'Order-tracking page + loyalty card look (colour/choice/switch per key). Missing key = brand-derived default.';
