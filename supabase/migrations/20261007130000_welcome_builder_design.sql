-- Welcome Builder: a merchant-designed welcome page built with the Hero
-- Builder engine (v5 flow design: sections -> columns -> widgets).
--
-- Additive and opt-in. Both columns are absent on every existing row, which
-- keeps the classic welcome screen (and, for single-location stores, no
-- welcome page at all) exactly as it ships today.
--
--   welcome_design          TEXT holding the design JSON, like hero_design —
--                           readers parse it through loadHeroDesign.
--   welcome_design_enabled  true once published; "Remove from storefront"
--                           clears it and keeps the design for later.
--
-- Written by tenant admins through their own session (store_setup), like
-- hero_design, so neither column joins guard_tenant_privileged_columns.

alter table public.tenants
  add column if not exists welcome_design text,
  add column if not exists welcome_design_enabled boolean not null default false;

comment on column public.tenants.welcome_design is
  'Welcome Builder design (Hero Builder v5 JSON as text). Read via loadHeroDesign.';
comment on column public.tenants.welcome_design_enabled is
  'Show the Welcome Builder page instead of the classic welcome screen.';
