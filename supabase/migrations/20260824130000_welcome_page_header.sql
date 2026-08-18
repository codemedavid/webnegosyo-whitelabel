-- Welcome page header controls: centre the copy, and optionally lead with the
-- store logo. Additive and defaulted to the shipped look (left-aligned, no
-- logo), so every existing tenant renders exactly as it does today.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_text_align TEXT NOT NULL DEFAULT 'left';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_show_logo BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_welcome_text_align_ck'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_welcome_text_align_ck
      CHECK (welcome_text_align IN ('left', 'center'));
  END IF;
END $$;

COMMENT ON COLUMN tenants.welcome_text_align IS 'Welcome page header alignment: left (default) or center.';
COMMENT ON COLUMN tenants.welcome_show_logo IS 'Show the store logo above the welcome page heading.';

-- Manual rollback:
--   ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_welcome_text_align_ck;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_text_align;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_show_logo;
