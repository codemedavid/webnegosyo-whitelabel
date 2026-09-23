-- Mobile grid columns: two cards per row by default, and no value stranded in
-- mobile_overrides.
--
-- 1. New tenants get 2 cards per row on phones (was 1). Existing tenants keep
--    the value they have.
-- 2. The storefront reads ONLY tenants.mobile_grid_columns. MCP update_branding
--    calls that put the setting in mobile_overrides saved without error but never
--    rendered; the app now moves such a value onto the column at write time.
--    Here the rows written before that fix get the same treatment: the override
--    value becomes the column value (it is the most recent intent) and the key
--    leaves the map.

ALTER TABLE public.tenants
  ALTER COLUMN mobile_grid_columns SET DEFAULT 2;

UPDATE public.tenants
SET
  mobile_grid_columns = CASE
    WHEN mobile_overrides->>'mobile_grid_columns' IN ('1', '2')
      THEN (mobile_overrides->>'mobile_grid_columns')::integer
    ELSE mobile_grid_columns
  END,
  mobile_overrides = mobile_overrides - 'mobile_grid_columns'
WHERE mobile_overrides ? 'mobile_grid_columns';

COMMENT ON COLUMN public.tenants.mobile_grid_columns IS
  'Cards per row on mobile viewports: 1 or 2 (default 2). Never stored in mobile_overrides.';
