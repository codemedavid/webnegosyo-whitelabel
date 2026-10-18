-- Brand editor v2, Phase 4 (docs/plans/2026-10-18-brand-editor-v2.md §6, §10).
--
-- storefront_labels: the store's own words for system labels on the ordering
-- screens, key → text, e.g. {"cart.title": "Your tray", "item.sold_out": "Ubos na"}.
-- A missing key keeps today's wording. Keys and lengths are validated by the
-- app (zod, src/lib/storefront-labels.ts); unknown keys are ignored on read.
--
-- section_schemes: which computed colour style (light / tinted / brand / dark)
-- each storefront section uses, e.g. {"header": "brand", "footer": "dark"}.
-- A missing section keeps today's colours.
--
-- Both are owner-editable branding (no privileged-column guard), read field by
-- field with fallbacks, so bad data degrades to today's look, never an error.
-- Constant defaults: added as metadata only, no table rewrite. The size checks
-- keep a single tenant row from growing without bound.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS storefront_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS section_schemes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_storefront_labels_object,
  ADD CONSTRAINT tenants_storefront_labels_object
    CHECK (jsonb_typeof(storefront_labels) = 'object' AND pg_column_size(storefront_labels) <= 16384),
  DROP CONSTRAINT IF EXISTS tenants_section_schemes_object,
  ADD CONSTRAINT tenants_section_schemes_object
    CHECK (jsonb_typeof(section_schemes) = 'object' AND pg_column_size(section_schemes) <= 2048);

COMMENT ON COLUMN tenants.storefront_labels IS
  'Owner wording for storefront system labels (key → text). Missing key = default wording.';
COMMENT ON COLUMN tenants.section_schemes IS
  'Colour style per storefront section (light|tinted|brand|dark). Missing section = current colours.';
