-- supabase/migrations/20260328000001_bundle_slots.sql

-- 1. Create bundle_slots table
CREATE TABLE bundle_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  pick_count INTEGER NOT NULL DEFAULT 1 CHECK (pick_count >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create bundle_slot_price_overrides table
CREATE TABLE bundle_slot_price_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  price_override NUMERIC NOT NULL CHECK (price_override >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, menu_item_id)
);

-- 3. Indexes
CREATE INDEX idx_bundle_slots_bundle_id ON bundle_slots(bundle_id);
CREATE INDEX idx_bundle_slots_category_id ON bundle_slots(category_id);
CREATE INDEX idx_bundle_slot_price_overrides_slot_id ON bundle_slot_price_overrides(slot_id);

-- 4. Enable RLS
ALTER TABLE bundle_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_slot_price_overrides ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for bundle_slots (tenant-scoped via bundles)
CREATE POLICY "Anyone can view bundle slots for active bundles"
  ON bundle_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bundles
      WHERE bundles.id = bundle_slots.bundle_id
    )
  );

CREATE POLICY "Authenticated users can manage slots for their tenant bundles"
  ON bundle_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bundles
      WHERE bundles.id = bundle_slots.bundle_id
        AND bundles.tenant_id IN (
          SELECT tenant_id FROM app_users WHERE user_id = auth.uid()
        )
    )
  );

-- 6. RLS policies for bundle_slot_price_overrides (via slots -> bundles)
CREATE POLICY "Anyone can view price overrides"
  ON bundle_slot_price_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bundle_slots
      JOIN bundles ON bundles.id = bundle_slots.bundle_id
      WHERE bundle_slots.id = bundle_slot_price_overrides.slot_id
    )
  );

CREATE POLICY "Authenticated users can manage price overrides for their tenant"
  ON bundle_slot_price_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bundle_slots
      JOIN bundles ON bundles.id = bundle_slots.bundle_id
      WHERE bundle_slots.id = bundle_slot_price_overrides.slot_id
        AND bundles.tenant_id IN (
          SELECT tenant_id FROM app_users WHERE user_id = auth.uid()
        )
    )
  );

-- 7. Drop old bundle_items table
DROP TABLE IF EXISTS bundle_items;
