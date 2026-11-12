-- Branding Studio: "Payment step" screen (checkout step after "Proceed to Payment").
--
-- payment_step_style: the owner's look for that step, key → value, e.g.
-- {"layout": "screen", "upload_design": "button", "band_color": "#e4572e"}.
-- '{}' (the default) is exactly the pre-2026-11-12 step: a bottom sheet with the
-- dashed upload box. Keys, hex colours, choices and the https example picture
-- are validated by the app (zod, src/lib/payment-step/style.ts) and re-validated
-- on every read, so bad data degrades to today's look, never an error.
--
-- Owner-editable branding (no privileged-column guard), like tracking_style and
-- storefront_labels. Constant default: metadata-only, no table rewrite. The size
-- check keeps one tenant row from growing without bound.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS payment_step_style jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_payment_step_style_object,
  ADD CONSTRAINT tenants_payment_step_style_object
    CHECK (jsonb_typeof(payment_step_style) = 'object' AND pg_column_size(payment_step_style) <= 4096);

COMMENT ON COLUMN tenants.payment_step_style IS
  'Checkout payment step look (layout, receipt upload design, colours, example picture). Empty = the standard bottom sheet.';
