-- Add note column to order_types table for service type policies
-- Run this migration on your Supabase database

ALTER TABLE order_types ADD COLUMN IF NOT EXISTS note TEXT;

-- Optional: Add a comment to describe the column's purpose
COMMENT ON COLUMN order_types.note IS 'Optional policy note shown to customers (e.g., extra charges, special instructions)';
