-- Add order token columns for secure public API access
-- These columns store a cryptographic token hash and expiration for secure order verification

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_token_hash TEXT,
ADD COLUMN IF NOT EXISTS order_token_expires_at TIMESTAMPTZ;

-- Create index for efficient token lookup
CREATE INDEX IF NOT EXISTS idx_orders_token_hash ON orders(order_token_hash) WHERE order_token_hash IS NOT NULL;

COMMENT ON COLUMN orders.order_token_hash IS 'SHA-256 hash of the order verification token (short-lived, for secure public API access)';
COMMENT ON COLUMN orders.order_token_expires_at IS 'Expiration timestamp for the order verification token (typically 15 minutes)';
