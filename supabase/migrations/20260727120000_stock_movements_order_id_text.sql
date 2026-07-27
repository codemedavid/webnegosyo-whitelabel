-- ============================================
-- Widen stock_movements.order_id to TEXT
-- ============================================
-- The ledger records which order spent an ingredient, but `order_id` was typed
-- UUID — which only ever fits orders living in the platform Supabase.
--
-- Orders have three homes (see createOrderAction): the platform Supabase, the
-- tenant's own Supabase project, and the tenant's Convex deployment. A Convex
-- document id is a base32-ish string, not a UUID, so every depletion insert for
-- a Convex-backed tenant failed with 22P02. Because depletion is deliberately
-- best-effort (a stock write must never lose a paid order), that error was
-- caught and logged, and those tenants silently saw stock never move.
--
-- TEXT is the only type that holds all three id shapes. The column is a
-- correlation key for tracing and reversing an order's movements — it has no
-- foreign key to enforce, since the referenced order may not live in this
-- database at all. Widening is lossless: every existing UUID casts to its
-- canonical text form, and the equality lookups the service performs
-- (`.eq('order_id', orderId)`) behave identically.
--
-- The partial index is rebuilt automatically by the type change.

ALTER TABLE stock_movements
  ALTER COLUMN order_id TYPE TEXT USING order_id::text;

COMMENT ON COLUMN stock_movements.order_id IS
  'Order that caused this movement, for sale/void rows. TEXT because orders may live in the platform Supabase (uuid), a tenant Supabase project (uuid), or a tenant Convex deployment (document id). Correlation key only — no FK, the order may be in another database.';

-- Rollback (only safe while every recorded order_id is a UUID):
--   ALTER TABLE stock_movements
--     ALTER COLUMN order_id TYPE UUID USING order_id::uuid;
