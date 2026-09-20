-- Which way a table faces on the floor plan
--
-- The floor draws real furniture now — a table top with chairs pulled in
-- around it — and a room is arranged by turning tables as much as by moving
-- them: a long table runs along a wall, a banquette faces the window. A
-- position alone cannot say that, so the table carries its own orientation.
--
-- Quarter turns only. A floor plan is read at a glance from a host stand;
-- free-angle tables buy nothing and cost the geometry its exactness.
--
-- Additive: one nullable-free column with a default, no existing object
-- altered. Rollback at the end.

ALTER TABLE dining_tables
  ADD COLUMN IF NOT EXISTS rotation SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dining_tables_rotation_ck'
  ) THEN
    ALTER TABLE dining_tables
      ADD CONSTRAINT dining_tables_rotation_ck CHECK (rotation IN (0, 90, 180, 270));
  END IF;
END $$;

COMMENT ON COLUMN dining_tables.rotation IS 'Quarter turns clockwise the table is set at on the floor: 0, 90, 180 or 270.';

-- ============================================
-- Rollback
-- ============================================
-- ALTER TABLE dining_tables DROP CONSTRAINT IF EXISTS dining_tables_rotation_ck;
-- ALTER TABLE dining_tables DROP COLUMN IF EXISTS rotation;
