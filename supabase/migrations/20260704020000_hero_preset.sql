-- Storefront hero layout preset knob (additive theme model, Stage 3).
-- Layout for the simple title/description hero (rendered when no advanced
-- block-hero design is set):
--   'theme'     — inherit today's centered serif hero (default; zero regression)
--   'centered'  — centered serif stack (today's look, named explicitly)
--   'editorial' — large left-aligned serif with an eyebrow rule
--   'split'     — title left, description right in a two-column row
--   'banner'    — full-width accent-tinted band behind the text
--   'collage'   — oversized offset title with the description beneath
--   'minimal'   — small uppercase tracked title with a compact description
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS hero_preset TEXT DEFAULT 'theme';

COMMENT ON COLUMN tenants.hero_preset IS
  'Storefront hero layout preset: theme | centered | editorial | split | banner | collage | minimal. Additive — theme keeps today''s centered hero.';
