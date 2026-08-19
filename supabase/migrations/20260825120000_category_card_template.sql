-- Per-category card template override.
-- NULL inherits the tenant-wide tenants.card_template; any card template id
-- ('classic', 'storefront', 'neon', ...) renders that category's cards with
-- that template. Unknown values fall back to the tenant template client-side.
alter table public.categories
  add column if not exists card_template text default null;

comment on column public.categories.card_template is
  'Per-category card template override; NULL inherits tenants.card_template.';
