-- Add checkout_template and cart_template fields to tenants table.
-- These let each merchant pick a selectable design for the customer
-- checkout page and cart page, mirroring the existing card_template system.
-- Each design inherits the tenant's existing branding colors.

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS checkout_template text DEFAULT 'classic',
ADD COLUMN IF NOT EXISTS cart_template text DEFAULT 'classic';

COMMENT ON COLUMN public.tenants.checkout_template IS
  'Checkout page design preset: classic, modern, wizard, minimal, or express.';
COMMENT ON COLUMN public.tenants.cart_template IS
  'Cart page design preset: classic, modern, wizard, minimal, or express.';

-- No CHECK constraint by design (mirrors card_template): validation lives in
-- the getCheckoutTemplateComponent/getCartTemplateComponent switch, which falls
-- back to 'classic' for any unknown value. New design IDs need no migration.
-- No index needed — read together with the tenant record.
