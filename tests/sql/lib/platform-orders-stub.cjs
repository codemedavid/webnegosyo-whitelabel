// The slice of the live platform schema that order RLS depends on, shared by
// the PGlite runners (tests/sql/run-permission-keys.cjs, the report parity
// worker). Provenance — read from the live platform DB (SELECT only) on
// 2026-10-14; see run-permission-keys.cjs for the object list.
//
//   STUB_SCHEMA        tables + the RLS helper functions, copied verbatim
//   PRE_0D_POLICIES    order/payment/revision policies as live BEFORE 0d
//                      (20261013120200 alters them; load it after these)
// Requires installPlatformAuth (lib/platform-auth.cjs) and, for the status
// guard in PRE_0D_POLICIES, app_user_has_permission (20261013120050) first.
const STUB_SCHEMA = `
  create table tenants (id uuid primary key, is_active boolean not null default true, lalamove_enabled boolean default false);
  create table outlets (id uuid primary key, tenant_id uuid not null);
  create table order_types (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, type text not null, is_enabled boolean default true);
  create table app_users (
    user_id uuid primary key, role text not null, tenant_id uuid,
    is_owner boolean not null default false, permissions text[], outlet_id uuid, platform_permissions text[],
    constraint app_users_role_ck check (role = any (array['superadmin','admin','platform_staff'])),
    constraint app_users_outlet_scope_ck check (outlet_id is null or (role = 'admin' and is_owner = false))
  );
  create table orders (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, total numeric(10,2) not null,
    status text not null default 'pending', payment_status text default 'pending',
    order_type_id uuid, lalamove_quotation_id text, outlet_id uuid
  );
  create table order_payments (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, order_id uuid not null,
    kind text not null check (kind = any (array['charge','refund'])), amount numeric(10,2) not null check (amount > 0),
    outlet_id uuid
  );
  create table order_revisions (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, order_id uuid not null, outlet_id uuid
  );

  -- Copied from live on 2026-10-14 (pg_get_functiondef).
  CREATE OR REPLACE FUNCTION public.app_user_is_superadmin()
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
    select exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and au.role = 'superadmin'
    );
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_admin_tenant_id()
   RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
    select au.tenant_id from public.app_users au
    where au.user_id = auth.uid() and au.role = 'admin';
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_admin_outlet_id()
   RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
    select au.outlet_id from public.app_users au
    where au.user_id = auth.uid() and au.role = 'admin';
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_may_see_order(order_tenant_id uuid, order_outlet_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (
            au.role = 'admin'
            AND au.tenant_id = order_tenant_id
            AND (au.outlet_id IS NULL OR au.outlet_id = order_outlet_id)
          )
        )
    );
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_platform_can(p_permissions text[])
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    select exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.role = 'platform_staff'
        and au.platform_permissions && p_permissions
    );
  $function$;
  revoke all on function public.app_user_platform_can(text[]) from public, anon;

  CREATE OR REPLACE FUNCTION public.order_child_inherit_branch()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
  DECLARE
    parent_tenant uuid;
    parent_outlet uuid;
  BEGIN
    SELECT o.tenant_id, o.outlet_id
      INTO parent_tenant, parent_outlet
      FROM public.orders o
     WHERE o.id = NEW.order_id;

    IF FOUND THEN
      NEW.tenant_id := parent_tenant;
      -- An unattributed order (no branch) leaves whatever the writer sent.
      IF parent_outlet IS NOT NULL THEN
        NEW.outlet_id := parent_outlet;
      END IF;
    END IF;

    RETURN NEW;
  END;
  $function$;
  create trigger order_payments_inherit_branch before insert on order_payments for each row execute function order_child_inherit_branch();
  create trigger order_revisions_inherit_branch before insert on order_revisions for each row execute function order_child_inherit_branch();
`

// Live policies in their PRE-0d shape (pg_policies, 2026-10-14). The status
// guard is created after 120000 because it calls app_user_has_permission.
const PRE_0D_POLICIES = `
  CREATE OR REPLACE FUNCTION public.orders_client_status_guard()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
  AS $function$
  begin
    if current_user not in ('anon', 'authenticated') then
      return new;
    end if;
    if new.status is not distinct from old.status then
      return new;
    end if;
    if old.status = 'delivered' and new.status = 'cancelled' then
      raise exception 'This order was already delivered, so it can no longer be cancelled.'
        using errcode = 'P0001';
    end if;
    if current_user = 'anon' then
      raise exception 'Changing an order needs a signed-in staff account.'
        using errcode = '42501';
    end if;
    if public.app_user_platform_can(array['stores.edit']) then
      return new;
    end if;
    if old.status = 'delivered' then
      if not public.app_user_has_permission(new.tenant_id, 'order_edit') then
        raise exception 'This order was already delivered. Moving it back needs the Edit Orders permission.'
          using errcode = '42501';
      end if;
      return new;
    end if;
    if (old.status = 'cancelled' or new.status = 'cancelled')
       and not public.app_user_has_permission(new.tenant_id, 'orders') then
      raise exception 'Cancelling or reopening an order needs the Orders permission. Ask the owner or a manager.'
        using errcode = '42501';
    end if;
    return new;
  end;
  $function$;
  create trigger orders_client_status_guard before update on orders for each row execute function orders_client_status_guard();

  alter table app_users enable row level security;
  alter table tenants enable row level security;
  alter table order_types enable row level security;
  alter table orders enable row level security;
  alter table order_payments enable row level security;
  alter table order_revisions enable row level security;

  create policy app_users_select_self on app_users for select using (user_id = auth.uid());
  create policy tenants_read_active on tenants for select using (is_active = true);
  create policy order_types_read_active on order_types for select using ((is_enabled = true) AND (EXISTS ( SELECT 1
     FROM tenants t
    WHERE ((t.id = order_types.tenant_id) AND (t.is_active = true)))));

  create policy orders_select_by_tenant on orders for select using (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id)))));
  create policy orders_insert_admin on orders for insert with check (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id)))));
  create policy orders_update_admin on orders for update
    using (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id)))))
    with check (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id)))));
  create policy orders_insert_customer on orders for insert to anon with check ((status = 'pending'::text) AND (payment_status = 'pending'::text) AND (EXISTS ( SELECT 1
     FROM tenants t
    WHERE ((t.id = orders.tenant_id) AND (t.is_active = true)))));
  create policy orders_require_server_lalamove_quote on orders as restrictive for insert to anon with check (EXISTS ( SELECT 1
     FROM tenants t
    WHERE ((t.id = orders.tenant_id) AND ((NOT COALESCE(t.lalamove_enabled, false)) OR ((orders.lalamove_quotation_id IS NULL) AND (EXISTS ( SELECT 1
             FROM order_types ot
            WHERE ((ot.id = orders.order_type_id) AND (ot.tenant_id = orders.tenant_id) AND (ot.type <> 'delivery'::text)))))))));
  create policy platform_staff_select on orders for select to authenticated using (( SELECT app_user_platform_can(ARRAY['stores.view'::text, 'tenants.view'::text, 'overview.view'::text]) AS app_user_platform_can));
  create policy platform_staff_insert on orders for insert to authenticated with check (( SELECT app_user_platform_can(ARRAY['stores.create'::text]) AS app_user_platform_can));
  create policy platform_staff_update on orders for update to authenticated using (( SELECT app_user_platform_can(ARRAY['stores.edit'::text]) AS app_user_platform_can)) with check (( SELECT app_user_platform_can(ARRAY['stores.edit'::text]) AS app_user_platform_can));

  create policy order_payments_select on order_payments for select using (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id)))));
  create policy order_payments_insert_admin on order_payments for insert to authenticated with check ((app_user_may_see_order(tenant_id, outlet_id) AND ((kind <> 'refund'::text) OR app_user_has_permission(tenant_id, 'order_refund'::text))));
  create policy platform_staff_select on order_payments for select to authenticated using (( SELECT app_user_platform_can(ARRAY['stores.view'::text, 'tenants.view'::text, 'overview.view'::text]) AS app_user_platform_can));
  create policy platform_staff_insert on order_payments for insert to authenticated with check (( SELECT app_user_platform_can(ARRAY['stores.create'::text]) AS app_user_platform_can));

  create policy order_revisions_select on order_revisions for select using (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id)))));
  create policy order_revisions_insert_admin on order_revisions for insert with check (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id)))));
  create policy platform_staff_select on order_revisions for select to authenticated using (( SELECT app_user_platform_can(ARRAY['stores.view'::text, 'tenants.view'::text, 'overview.view'::text]) AS app_user_platform_can));
  create policy platform_staff_insert on order_revisions for insert to authenticated with check (( SELECT app_user_platform_can(ARRAY['stores.create'::text]) AS app_user_platform_can));

  -- Table ACLs as live (Supabase default privileges, then narrowed).
  revoke all on orders, order_payments, order_revisions from anon, authenticated;
  grant select, insert, update on orders to anon, authenticated;
  grant select, insert on order_payments, order_revisions to anon, authenticated;
`

module.exports = { STUB_SCHEMA, PRE_0D_POLICIES }
