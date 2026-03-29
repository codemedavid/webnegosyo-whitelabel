-- Add upgrade-specific columns to upsell_pairs
-- These columns support the "Make it a Meal?" upgrade upsell feature
-- with custom labels for source/target items and a configurable header

ALTER TABLE upsell_pairs
  ADD COLUMN IF NOT EXISTS source_label TEXT,
  ADD COLUMN IF NOT EXISTS target_label TEXT,
  ADD COLUMN IF NOT EXISTS upgrade_header TEXT;

COMMENT ON COLUMN upsell_pairs.source_label IS 'Custom label for the source (current) item in upgrade comparison (e.g. "A la carte")';
COMMENT ON COLUMN upsell_pairs.target_label IS 'Custom label for the target (upgrade) item in upgrade comparison (e.g. "Meal")';
COMMENT ON COLUMN upsell_pairs.upgrade_header IS 'Custom header text for upgrade prompt (e.g. "Want to make it a meal?")';
