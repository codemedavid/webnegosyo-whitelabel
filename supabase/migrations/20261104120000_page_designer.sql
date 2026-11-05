-- Page Designer: merchant-designed checkout, thank-you and order-tracking
-- pages built with the Hero Builder engine (v5 flow design), plus how the
-- thank-you page hands over to tracking.
--
-- Additive and opt-in. Every existing row reads as "standard page", which is
-- exactly what ships today:
--   <page>_design          TEXT holding the design JSON, like hero_design /
--                          welcome_design — readers parse it via loadHeroDesign.
--   <page>_design_enabled  true once published; "Remove from storefront"
--                          clears it and keeps the design for later.
--   confirmation_redirect  'instant' (today: straight to tracking once the
--                          order is saved), 'countdown' (thank-you page, then
--                          tracking after confirmation_redirect_seconds) or
--                          'stay' (thank-you page until the customer taps).
--
-- Written by tenant admins through their own session (store_setup), like the
-- welcome page, so none of these join guard_tenant_privileged_columns.

alter table public.tenants
  add column if not exists checkout_design text,
  add column if not exists checkout_design_enabled boolean not null default false,
  add column if not exists confirmation_design text,
  add column if not exists confirmation_design_enabled boolean not null default false,
  add column if not exists tracking_design text,
  add column if not exists tracking_design_enabled boolean not null default false,
  add column if not exists confirmation_redirect text not null default 'instant',
  add column if not exists confirmation_redirect_seconds smallint not null default 5;

-- 600 KB is the editor's own cap (LIMITS.designBytes); the column refuses
-- anything far beyond it so a forged write can't bloat the shared tenant row.
alter table public.tenants
  drop constraint if exists tenants_page_design_size_check,
  add constraint tenants_page_design_size_check check (
    coalesce(octet_length(checkout_design), 0) <= 700000
    and coalesce(octet_length(confirmation_design), 0) <= 700000
    and coalesce(octet_length(tracking_design), 0) <= 700000
  ),
  drop constraint if exists tenants_confirmation_redirect_check,
  add constraint tenants_confirmation_redirect_check check (
    confirmation_redirect in ('instant', 'countdown', 'stay')
    and confirmation_redirect_seconds between 3 and 60
  );

comment on column public.tenants.checkout_design is
  'Page Designer checkout design (Hero Builder v5 JSON as text). Read via loadHeroDesign.';
comment on column public.tenants.checkout_design_enabled is
  'Render the Page Designer checkout instead of the checkout template.';
comment on column public.tenants.confirmation_design is
  'Page Designer thank-you design (Hero Builder v5 JSON as text). Read via loadHeroDesign.';
comment on column public.tenants.confirmation_design_enabled is
  'Render the Page Designer thank-you page instead of the standard one.';
comment on column public.tenants.tracking_design is
  'Page Designer order-tracking design (Hero Builder v5 JSON as text). Read via loadHeroDesign.';
comment on column public.tenants.tracking_design_enabled is
  'Render the Page Designer tracking page instead of the standard one.';
comment on column public.tenants.confirmation_redirect is
  'After an order is saved: instant (go to tracking), countdown (thank-you page then tracking), stay (thank-you page).';
comment on column public.tenants.confirmation_redirect_seconds is
  'Seconds the thank-you page shows before tracking when confirmation_redirect = countdown (3-60).';
