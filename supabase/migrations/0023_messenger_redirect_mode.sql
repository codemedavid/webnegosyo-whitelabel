-- Add messenger_redirect_mode column to tenants table
-- This controls how checkout redirects to Messenger:
-- 'webhook' (default) = uses m.me links with ref parameter for tracking
-- 'direct' = uses messenger.com/t/ for simple direct opening

ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS messenger_redirect_mode TEXT 
DEFAULT 'webhook' 
CHECK (messenger_redirect_mode IN ('webhook', 'direct'));

-- Add comment for documentation
COMMENT ON COLUMN tenants.messenger_redirect_mode IS 
'Controls how checkout redirects to Messenger: webhook = m.me with ref tracking, direct = messenger.com/t/';
