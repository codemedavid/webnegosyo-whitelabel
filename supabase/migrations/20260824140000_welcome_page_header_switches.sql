-- Welcome page header switches: drop the header entirely, or keep the logo and
-- turn the copy off. Both default TRUE — unlike the logo toggle, these only
-- ever take something away, so every existing tenant keeps today's heading.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_show_header BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_show_copy BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN tenants.welcome_show_header IS 'Show the welcome page header (logo + copy) at all.';
COMMENT ON COLUMN tenants.welcome_show_copy IS 'Show the welcome page heading and subheading; off leaves a logo-only header.';

-- Manual rollback:
--   ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_show_header;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_show_copy;
