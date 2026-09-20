-- Dining tables and seatings — the floor plan a dine-in store runs
--
-- Until now a "table" existed only as free text a customer typed at checkout
-- (orders.customer_data.table_number). Nothing knew which tables a store has,
-- which are occupied, how many guests sit at one, or when they sat down. The
-- merchant app's Tables tab needs all of that, so this adds the floor itself:
-- a table per row, positioned on a free-form canvas, and a seating per party.
--
-- Orders are NOT linked by foreign key. The order keeps carrying the table's
-- label in customer_data.table_number (both order backends already do, and
-- Convex is not redeployed for this), and the app matches orders to tables by
-- normalized label. That keeps the floor working for every tenant on day one.
--
-- Lives in the PLATFORM database for every tenant, exactly like outlets and
-- staff_shifts: the floor is store configuration, whichever database serves
-- the orders.
--
-- Additive: two new tables, no existing object altered. Rollback at end.

-- ============================================
-- dining_tables
-- ============================================
CREATE TABLE IF NOT EXISTS dining_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- The branch whose floor this table stands on. NULL is the single-location
  -- store's one floor; a store-wide account reaches it, a branch-locked one
  -- does not (app_user_may_reach_branch treats NULL as the store pool).
  outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,

  -- Shown as typed ("12", "A3", "Patio 2"); compared case-insensitively.
  label TEXT NOT NULL,
  seats INT NOT NULL DEFAULT 4,
  shape TEXT NOT NULL DEFAULT 'square',
  size TEXT NOT NULL DEFAULT 'md',
  zone TEXT,

  -- Where the table sits on the floor canvas: the node's CENTRE, as a fraction
  -- of the canvas width and height, so the same floor draws on any screen.
  pos_x NUMERIC(6,4) NOT NULL DEFAULT 0.1,
  pos_y NUMERIC(6,4) NOT NULL DEFAULT 0.1,

  sort_order INT NOT NULL DEFAULT 0,
  -- Archived, never deleted: a table's seatings are history worth keeping.
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dining_tables_label_ck CHECK (length(btrim(label)) BETWEEN 1 AND 24),
  CONSTRAINT dining_tables_seats_ck CHECK (seats BETWEEN 1 AND 99),
  CONSTRAINT dining_tables_shape_ck CHECK (shape IN ('round', 'square', 'rect')),
  CONSTRAINT dining_tables_size_ck CHECK (size IN ('sm', 'md', 'lg')),
  CONSTRAINT dining_tables_pos_ck CHECK (pos_x BETWEEN 0 AND 1 AND pos_y BETWEEN 0 AND 1),
  CONSTRAINT dining_tables_zone_ck CHECK (zone IS NULL OR length(btrim(zone)) BETWEEN 1 AND 40)
);

COMMENT ON TABLE dining_tables IS 'A store''s floor plan, per branch. Orders reference a table by label in customer_data.table_number, not by key.';
COMMENT ON COLUMN dining_tables.pos_x IS 'Node centre as a fraction of the floor canvas width (0..1).';
COMMENT ON COLUMN dining_tables.pos_y IS 'Node centre as a fraction of the floor canvas height (0..1).';
COMMENT ON COLUMN dining_tables.is_active IS 'False = archived. The label may then be reused by a new table on the same floor.';

-- One live label per floor. The zero uuid stands in for the single-location
-- floor so two NULL outlets still collide, which a plain UNIQUE would not do.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dining_tables_floor_label
  ON dining_tables (
    tenant_id,
    COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid),
    upper(btrim(label))
  )
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_dining_tables_tenant
  ON dining_tables(tenant_id, outlet_id, sort_order);

-- ============================================
-- table_seatings
-- ============================================
CREATE TABLE IF NOT EXISTS table_seatings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Copied from the table by trigger so the branch RLS predicate can be
  -- answered on this row alone.
  outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
  table_id UUID NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,

  party_size INT NOT NULL,
  note TEXT,

  seated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL while the party is at the table. Set once, when the table is cleared.
  cleared_at TIMESTAMPTZ,

  -- SET NULL, as staff_shifts does: removing an account must not erase
  -- last month's covers.
  seated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cleared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT table_seatings_party_ck CHECK (party_size BETWEEN 1 AND 99),
  CONSTRAINT table_seatings_cleared_ck CHECK (cleared_at IS NULL OR cleared_at >= seated_at),
  CONSTRAINT table_seatings_note_ck CHECK (note IS NULL OR length(note) <= 200)
);

COMMENT ON TABLE table_seatings IS 'One row per party seated at a table. An open row (cleared_at IS NULL) is the party there now; closed rows are the turn history.';

-- One party at a table at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_table_seatings_open
  ON table_seatings(table_id)
  WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_table_seatings_tenant_open
  ON table_seatings(tenant_id)
  WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_table_seatings_table_history
  ON table_seatings(table_id, seated_at DESC);

-- ============================================
-- Triggers
-- ============================================
-- The branch must belong to this store. FKs alone do not guarantee it, and
-- RLS is written against tenant_id.
CREATE OR REPLACE FUNCTION dining_table_branch_belongs_to_tenant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Table branch belongs to a different store';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_dining_table_branch ON dining_tables;
CREATE TRIGGER trg_dining_table_branch
  BEFORE INSERT OR UPDATE ON dining_tables
  FOR EACH ROW EXECUTE FUNCTION dining_table_branch_belongs_to_tenant();

-- A seating inherits its table's store and branch, and may not name a table
-- from another store.
CREATE OR REPLACE FUNCTION table_seating_inherits_table() RETURNS TRIGGER AS $$
DECLARE
  t RECORD;
BEGIN
  SELECT tenant_id, outlet_id INTO t FROM dining_tables WHERE id = NEW.table_id;
  IF t IS NULL OR t.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Seating names a table from a different store';
  END IF;
  NEW.outlet_id := t.outlet_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_table_seating_inherits ON table_seatings;
CREATE TRIGGER trg_table_seating_inherits
  BEFORE INSERT ON table_seatings
  FOR EACH ROW EXECUTE FUNCTION table_seating_inherits_table();

-- A closed seating is history: the party and its times never change again.
CREATE OR REPLACE FUNCTION protect_closed_seating() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.cleared_at IS NOT NULL
    AND (to_jsonb(NEW) - 'seated_by' - 'cleared_by') <> (to_jsonb(OLD) - 'seated_by' - 'cleared_by') THEN
    RAISE EXCEPTION 'A cleared seating cannot be changed';
  END IF;
  IF NEW.table_id <> OLD.table_id OR NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'A seating cannot move to another table';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_table_seating_closed ON table_seatings;
CREATE TRIGGER trg_table_seating_closed
  BEFORE UPDATE ON table_seatings
  FOR EACH ROW EXECUTE FUNCTION protect_closed_seating();

-- ============================================
-- RLS — read and written by branch reach; superadmins everywhere; no DELETE
-- ============================================
-- The merchant app writes these with the staffer's own session, so INSERT and
-- UPDATE are granted (unlike order_status_events, which only the platform
-- writes). app_user_may_reach_branch() from 20260809120000 keeps the branch
-- rule to one definition. Nothing may DELETE: a table is archived, a seating
-- is cleared.
ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_seatings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dining_tables_select_branch ON dining_tables;
CREATE POLICY dining_tables_select_branch ON dining_tables FOR SELECT TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id));
DROP POLICY IF EXISTS dining_tables_insert_branch ON dining_tables;
CREATE POLICY dining_tables_insert_branch ON dining_tables FOR INSERT TO authenticated
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));
DROP POLICY IF EXISTS dining_tables_update_branch ON dining_tables;
CREATE POLICY dining_tables_update_branch ON dining_tables FOR UPDATE TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id))
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));
DROP POLICY IF EXISTS dining_tables_all_superadmin ON dining_tables;
CREATE POLICY dining_tables_all_superadmin ON dining_tables FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

DROP POLICY IF EXISTS table_seatings_select_branch ON table_seatings;
CREATE POLICY table_seatings_select_branch ON table_seatings FOR SELECT TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id));
DROP POLICY IF EXISTS table_seatings_insert_branch ON table_seatings;
CREATE POLICY table_seatings_insert_branch ON table_seatings FOR INSERT TO authenticated
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));
DROP POLICY IF EXISTS table_seatings_update_branch ON table_seatings;
CREATE POLICY table_seatings_update_branch ON table_seatings FOR UPDATE TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id))
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));
DROP POLICY IF EXISTS table_seatings_all_superadmin ON table_seatings;
CREATE POLICY table_seatings_all_superadmin ON table_seatings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

-- ============================================
-- Rollback
-- ============================================
-- DROP TABLE IF EXISTS table_seatings;
-- DROP TABLE IF EXISTS dining_tables;
-- DROP FUNCTION IF EXISTS protect_closed_seating();
-- DROP FUNCTION IF EXISTS table_seating_inherits_table();
-- DROP FUNCTION IF EXISTS dining_table_branch_belongs_to_tenant();
