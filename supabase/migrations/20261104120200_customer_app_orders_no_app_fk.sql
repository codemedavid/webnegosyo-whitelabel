-- Customer app (Phase 4): customer_app_orders.app_id no longer references tenant_apps.
--
-- 20261104120000 tied app_id to tenant_apps(tenant_id). A store's app row only
-- exists once App Studio creates it (Phase 8); until then the development build
-- serves a store through APP_DEV_TENANT_SLUG with NO tenant_apps row, so every
-- order the app placed broke this foreign key and was answered "unavailable"
-- after the order itself had been written. app_id stays equal to tenant_id
-- (customer_app_orders_app_is_store_ck), and the history still survives a
-- removed app row — now simply because nothing cascades from tenant_apps.
-- Deleting the store still cascades through tenant_id.

alter table public.customer_app_orders
  drop constraint if exists customer_app_orders_app_id_fkey;

-- Rollback (only once every store with app orders has a tenant_apps row):
--   alter table public.customer_app_orders add constraint customer_app_orders_app_id_fkey
--     foreign key (app_id) references public.tenant_apps(tenant_id);
