-- Add card_template field to tenants table
-- This allows admins to choose different menu card layouts

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS card_template text DEFAULT 'classic';

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.card_template IS 
  'Menu card template style: classic, minimal, modern, elegant, compact, or bold';

-- No need for indexes as this will be read with the tenant record

