-- Add Enable Order Management Toggle Migration
-- Allows superadmin to enable/disable order saving to database per tenant
-- When disabled: orders only redirect to Messenger, no database storage
-- When enabled: orders saved to database and visible in order management

-- Add enable_order_management column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS enable_order_management boolean DEFAULT true;

-- Update existing tenants to have order management enabled by default
UPDATE public.tenants 
SET enable_order_management = true
WHERE enable_order_management IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.enable_order_management IS 'Enable/disable order database storage. When disabled, orders only redirect to Messenger without backend tracking';

