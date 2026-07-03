-- Storefront category-navigation style knob (additive theme model, Stage 2).
-- Presentation style for the category tabs on the customer menu:
--   'theme'     — inherit today's soft-tinted pills (default; zero regression)
--   'pills'     — soft-tinted rounded pills (today's look, named explicitly)
--   'chips'     — outlined chips that fill with the accent when active
--   'underline' — flat subheader tabs with an accent underline on the active one
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS category_nav_style TEXT DEFAULT 'theme';

COMMENT ON COLUMN tenants.category_nav_style IS
  'Storefront category-nav presentation style: theme | pills | chips | underline. Additive — theme keeps today''s pills.';
