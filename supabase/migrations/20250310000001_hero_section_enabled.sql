ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS hero_section_enabled boolean NOT NULL DEFAULT true;
