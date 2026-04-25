ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS search_bar_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS search_bar_background text,
  ADD COLUMN IF NOT EXISTS search_bar_text text,
  ADD COLUMN IF NOT EXISTS search_bar_placeholder text,
  ADD COLUMN IF NOT EXISTS search_bar_icon text,
  ADD COLUMN IF NOT EXISTS search_bar_border text,
  ADD COLUMN IF NOT EXISTS search_bar_focus_ring text,
  ADD COLUMN IF NOT EXISTS search_bar_radius text NOT NULL DEFAULT 'pill'
    CHECK (search_bar_radius IN ('pill', 'rounded', 'square')),
  ADD COLUMN IF NOT EXISTS search_bar_style text NOT NULL DEFAULT 'filled'
    CHECK (search_bar_style IN ('filled', 'outline', 'ghost'));

COMMENT ON COLUMN tenants.search_bar_enabled IS 'Toggle visibility of menu search bar';
COMMENT ON COLUMN tenants.search_bar_radius IS 'pill | rounded | square';
COMMENT ON COLUMN tenants.search_bar_style IS 'filled | outline | ghost';
