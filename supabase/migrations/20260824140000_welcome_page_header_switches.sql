-- Welcome page header switches.
--
--  * welcome_show_header — lead the welcome page with the STORE HEADER: the
--    branded bar the menu page wears (logo + store name + tagline on the header
--    colour), centred and without the cart. Additive, so it defaults FALSE:
--    switching it on gives a tenant a bar it does not have today.
--  * welcome_show_copy — the welcome heading and subheading. Defaults TRUE;
--    every tenant has copy today and this switch only takes it away.
--
-- The two are independent: a merchant may want either, both, or neither.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_show_header BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_show_copy BOOLEAN NOT NULL DEFAULT true;

-- An earlier revision of this migration shipped welcome_show_header defaulting
-- TRUE, back when "header" meant the heading block rather than the store bar.
-- Re-point the default and clear anything that inherited the old one; no tenant
-- has consciously set this column yet.
ALTER TABLE tenants ALTER COLUMN welcome_show_header SET DEFAULT false;
UPDATE tenants SET welcome_show_header = false WHERE welcome_show_header IS TRUE;

COMMENT ON COLUMN tenants.welcome_show_header IS 'Lead the welcome page with the branded store header bar (logo + name + tagline), centred and cart-less.';
COMMENT ON COLUMN tenants.welcome_show_copy IS 'Show the welcome page heading and subheading.';

-- Manual rollback:
--   ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_show_header;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_show_copy;
