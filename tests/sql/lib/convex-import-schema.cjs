// The slice of the live platform schema a Convex→platform import touches:
// orders and their children with every trigger that fires on them, product
// costs, the stock-claim tables the import rekeys, and Store Activity.
//
// Provenance: read from the live platform DB (SELECT only: information_schema,
// pg_get_functiondef, pg_get_triggerdef) on 2026-11-12. Trigger functions are
// copied VERBATIM; helpers that only build activity text, after-hours checks or
// recipe costs are STUBS (named below) because the runner asserts what the
// triggers do, not how a title is worded.
//
// Stubbed (and why):
//   net.http_post                     records the call in net_calls (pg_net is not in PGlite)
//   cash.business_day_of              Manila calendar date (no cutoffs seeded)
//   store_activity_actor / _order_label / _mask_name / _category_of /
//   _is_routine / _actor_name / _scrub / _peso / _flag_cash_refund_noncash
//                                     text helpers; _is_after_hours returns TRUE so the
//                                     backfill setting's effect on flags is visible
//   store_activity_record_order_discounts / _capture_order_revisions
//                                     write one marker row each
//   inventory_recipe_cost             0 (no recipes seeded)
//   stock_movement_count_session_is_valid  passes rows without a count session (all the
//                                     import ever rekeys); refuses the rest
// Elided: the UPDATE branch of store_activity_on_orders (its trigger's WHEN clause
// only fires on status / payment status / discount changes, which an import never
// makes) and orders_client_status_guard (BEFORE UPDATE OF status, same reason).
// Requires installPlatformAuth (lib/platform-auth.cjs) first.

const LIVE_SCHEMA = `
  create schema if not exists net;
  create table net_calls (id bigserial primary key, url text not null, body jsonb, at timestamptz default clock_timestamp());
  create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
  returns bigint language sql as $$ insert into public.net_calls(url, body) values (url, body) returning id $$;

  create schema if not exists cash;
  create or replace function cash.business_day_of(p_tenant uuid, p_at timestamptz) returns date
  language sql stable as $$ select (p_at at time zone 'Asia/Manila')::date $$;

  create table tenants (
    id uuid primary key, slug text unique not null, order_backend text default 'auto',
    convex_deployment_url text, loyalty_enabled boolean default false, loyalty_shadow boolean default true,
    timezone text default 'Asia/Manila', is_active boolean default true, updated_at timestamptz default now()
  );
  create table tenant_secrets (tenant_id uuid primary key references tenants on delete cascade, convex_deploy_key text);
  create table outlets (id uuid primary key, tenant_id uuid not null references tenants on delete cascade);
  create table order_types (id uuid primary key, tenant_id uuid not null references tenants on delete cascade, type text not null default 'dine_in', name text);
  create table payment_methods (id uuid primary key, tenant_id uuid not null references tenants on delete cascade, name text not null);
  create table categories (id uuid primary key, tenant_id uuid not null references tenants on delete cascade, name text not null);
  create table menu_items (id uuid primary key, tenant_id uuid not null references tenants on delete cascade, category_id uuid references categories, name text not null);
  create table customers (id uuid primary key, tenant_id uuid not null references tenants on delete cascade);
  create table customer_external_orders (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
    customer_id uuid not null references customers on delete cascade,
    backend text not null check (backend = any (array['convex','tenant_supabase'])),
    external_order_id text not null, total numeric not null default 0, ordered_at timestamptz not null default now(),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table app_users (user_id uuid primary key, role text not null, tenant_id uuid, outlet_id uuid);

  create table orders (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    customer_name text, customer_contact text,
    total numeric(10,2) not null constraint orders_total_ck check (total >= 0),
    status text not null default 'pending' constraint orders_status_ck check (status = any (array['pending','confirmed','preparing','ready','delivered','cancelled'])),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    order_type_id uuid references order_types(id), order_type text, customer_data jsonb default '{}'::jsonb,
    delivery_fee numeric(10,2) default 0,
    lalamove_quotation_id text, lalamove_order_id text, lalamove_status text, lalamove_driver_id text,
    lalamove_driver_name text, lalamove_driver_phone text, lalamove_tracking_url text,
    payment_method_id uuid references payment_methods(id), payment_method_name text, payment_method_details text,
    payment_method_qr_code_url text,
    payment_status text default 'pending' constraint orders_payment_status_ck check (payment_status = any (array['pending','paid','failed','verified'])),
    order_token_hash text, order_token_expires_at timestamptz, service_charge_amount numeric(10,2) default 0,
    scheduled_for timestamptz, payment_proof_url text, payment_proof_public_id text, payment_proof_reference text,
    payment_proof_uploaded_at timestamptz, customer_id uuid references customers(id) on delete set null,
    source text not null default 'web' constraint orders_source_ck check (source = any (array['web','mobile','qr_handoff','pos'])),
    client_order_id text, item_count integer, has_upsell_items boolean not null default false,
    has_bundle_items boolean not null default false, outlet_id uuid references outlets(id) on delete set null,
    amount_paid numeric(10,2) not null default 0, revision_number integer not null default 0,
    edited_at timestamptz, edited_by uuid, discount_total numeric(10,2) not null default 0, discount_data jsonb,
    loyverse_receipt_number text, loyverse_push_status text, loyverse_pushed_at timestamptz, loyverse_push_error text,
    prep_minutes integer constraint orders_prep_minutes_range check (prep_minutes is null or (prep_minutes >= 1 and prep_minutes <= 240)),
    promised_ready_at timestamptz, daily_number integer, order_date date,
    cancel_reason text constraint orders_cancel_reason_len_ck check (cancel_reason is null or length(cancel_reason) <= 500)
  );
  create unique index orders_tenant_client_order_id_uq on orders (tenant_id, client_order_id) where client_order_id is not null;
  create unique index idx_orders_tenant_day_number on orders (tenant_id, order_date, daily_number) where daily_number is not null;

  create table order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade,
    menu_item_id uuid references menu_items(id) on delete set null,
    menu_item_name text not null, variation text, addons text[] not null default '{}'::text[],
    quantity integer not null default 1 constraint order_items_qty_ck check (quantity > 0),
    price numeric(10,2) not null constraint order_items_price_ck check (price >= 0),
    subtotal numeric(10,2) not null constraint order_items_subtotal_ck check (subtotal >= 0),
    special_instructions text, variation_selections jsonb, is_upsell_item boolean not null default false,
    is_bundle_item boolean not null default false, bundle_id uuid, bundle_name text, slot_name text,
    discount_amount numeric not null default 0, category_name text,
    addon_details jsonb constraint order_items_addon_details_is_array check (addon_details is null or jsonb_typeof(addon_details) = 'array')
  );
  create table order_payments (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
    order_id uuid not null references orders(id) on delete cascade,
    kind text not null constraint order_payments_kind_ck check (kind = any (array['charge','refund'])),
    amount numeric(10,2) not null constraint order_payments_amount_ck check (amount > 0),
    payment_method_id uuid, payment_method_name text, reference text, proof_url text, proof_public_id text,
    recorded_by uuid, outlet_id uuid references outlets(id) on delete set null, note text,
    created_at timestamptz not null default now()
  );
  create table order_revisions (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
    order_id uuid not null references orders(id) on delete cascade, revision_number integer not null,
    items_before jsonb not null, items_after jsonb not null, total_before numeric not null, total_after numeric not null,
    reason text, revised_by uuid, outlet_id uuid references outlets(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint order_revisions_number_uq unique (order_id, revision_number)
  );
  create table order_refunds (id uuid primary key default gen_random_uuid(), tenant_id uuid, payment_row_ids uuid[], opening_payment_id uuid, revision_id uuid);
  create table product_costs (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
    menu_item_id uuid not null references menu_items(id) on delete cascade, cost_price numeric not null default 0,
    cost_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    constraint product_costs_tenant_id_menu_item_id_key unique (tenant_id, menu_item_id)
  );
  create table order_item_costs (
    order_item_id uuid primary key references order_items(id) on delete cascade,
    tenant_id uuid not null references tenants(id) on delete cascade,
    unit_cost numeric not null check (unit_cost >= 0), source text not null check (source = any (array['recipe','manual'])),
    costed_at timestamptz not null default now()
  );
  create table recipes (id uuid primary key, tenant_id uuid, menu_item_id uuid, target_type text);
  create function public.inventory_recipe_cost(uuid, uuid) returns numeric language sql as $$ select 0::numeric $$;
  create table daily_order_counters (tenant_id uuid not null, order_date date not null, last_number integer not null, primary key (tenant_id, order_date));
  create table loyalty_earning_jobs (
    tenant_id uuid not null, backend text not null, external_order_id text not null, revision int not null default 0,
    next_attempt_at timestamptz default now(), attempts int default 0, last_result text, lease_token uuid, lease_until timestamptz,
    unique (tenant_id, backend, external_order_id)
  );
  create table order_stock_applications (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
    order_id text not null, reason text not null, created_at timestamptz not null default now(), revision int not null default 0,
    kind text not null default 'order'
  );
  create unique index order_stock_applications_unique_kind on order_stock_applications (tenant_id, order_id, reason, kind, revision);
  create table simple_option_stock_applications (
    tenant_id uuid not null, order_id text not null, action text not null, revision int not null, created_at timestamptz not null default now(),
    primary key (tenant_id, order_id, action, revision)
  );
  create table simple_option_stock_movements (id bigserial primary key, tenant_id uuid not null, order_id text not null, action text, revision int, quantity_delta bigint);
  create table presell_stock_applications (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, order_id text not null, reason text);
  create table stock_movements (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, order_id text, reason text not null,
    inventory_count_id uuid, outlet_id uuid, quantity numeric
  );
  create table order_status_events (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, external_order_id text not null);
  create table store_activity (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, outlet_id uuid, occurred_at timestamptz not null,
    category text, kind text not null, is_routine boolean, actor_user_id uuid, actor_name text, amount numeric,
    quantity numeric, unit text, reason text, note text, subject_type text, subject_ref text, order_number text,
    backend text, external_order_id text, before jsonb, after jsonb, summary jsonb, flags text[] not null default '{}',
    source_table text, source_id text, event_key text not null
  );
  create unique index store_activity_event_key_uq on store_activity (event_key);

  -- ── Stubs (see header) ──
  create function public.store_activity_actor() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.store_activity_order_label(n integer, id text) returns text language sql immutable as $$ select coalesce('#' || n::text, '#' || left(id, 6)) $$;
  create function public.store_activity_mask_name(t text) returns text language sql immutable as $$ select case when t is null then null else left(t, 1) || '***' end $$;
  create function public.store_activity_category_of(k text) returns text language sql immutable as $$ select split_part(k, '.', 1) $$;
  create function public.store_activity_is_routine(k text) returns boolean language sql immutable as $$ select k in ('order.placed', 'payment.charged') $$;
  create function public.store_activity_actor_name(u uuid) returns text language sql stable as $$ select null::text $$;
  create function public.store_activity_scrub(t text) returns text language sql immutable as $$ select t $$;
  create function public.store_activity_peso(a numeric) returns text language sql immutable as $$ select '₱' || a::text $$;
  create function public.store_activity_is_after_hours(t uuid, o uuid, at timestamptz) returns boolean language sql stable as $$ select true $$;
  create function public.store_activity_flag_cash_refund_noncash(o uuid, m text, p uuid) returns boolean language sql stable as $$ select false $$;
  create function public.store_activity_record_order_discounts(n public.orders, o public.orders, a uuid, s text) returns void language sql as $$
    insert into public.store_activity (tenant_id, occurred_at, kind, event_key, backend, external_order_id)
    select n.tenant_id, n.created_at, 'discount.applied', 'orders:' || n.id || ':discount:' || s, 'platform', n.id::text
     where coalesce(n.discount_total, 0) > 0
    on conflict (event_key) do nothing
  $$;
  create function public.store_activity_capture_order_revisions(r public.order_revisions) returns void language sql as $$
    insert into public.store_activity (tenant_id, occurred_at, kind, event_key, backend, external_order_id)
    values (r.tenant_id, r.created_at, 'order.edited', 'order_revisions:' || r.id, 'platform', r.order_id::text)
    on conflict (event_key) do nothing
  $$;

  -- ── Live, verbatim ──
  CREATE OR REPLACE FUNCTION public.next_daily_order_number(p_tenant_id uuid, p_order_date date)
   RETURNS integer
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public'
  AS $function$
  declare next_number integer;
  begin
    -- Seed from any previously numbered rows when importing an older deployment.
    insert into daily_order_counters(tenant_id, order_date, last_number)
    select p_tenant_id, p_order_date, coalesce(max(daily_number), 0) + 1
      from orders where tenant_id = p_tenant_id and order_date = p_order_date
    on conflict (tenant_id, order_date) do update
      set last_number = greatest(daily_order_counters.last_number + 1, excluded.last_number)
    returning last_number into next_number;
    return next_number;
  end $function$;

  CREATE OR REPLACE FUNCTION public.assign_daily_order_number()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
  declare zone text;
  begin
    if current_setting('app.order_restore', true) = 'on' then
      return new;
    end if;
    select coalesce(timezone, 'Asia/Manila') into zone from tenants where id = new.tenant_id;
    new.order_date := case
      when coalesce(zone, 'Asia/Manila') = 'Asia/Manila' then cash.business_day_of(new.tenant_id, coalesce(new.created_at, now()))
      else (coalesce(new.created_at, now()) at time zone zone)::date
    end;
    new.daily_number := next_daily_order_number(new.tenant_id, new.order_date);
    return new;
  end $function$;

  CREATE OR REPLACE FUNCTION public.notify_order_push()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
  AS $function$
  begin
    -- A restored order is not a new order; do not wake every device in the store.
    if current_setting('app.order_restore', true) = 'on' then
      return new;
    end if;
    perform net.http_post(
      url := 'https://www.webnegosyo.com/api/push/notify-order',
      body := jsonb_build_object('order_id', new.id, 'tenant_id', new.tenant_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    return new;
  exception when others then
    return new;
  end $function$;

  CREATE OR REPLACE FUNCTION public.notify_messenger_order_update()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
  AS $function$
  begin
    perform net.http_post(
      url := 'https://www.webnegosyo.com/api/messenger/order-update',
      body := jsonb_build_object('order_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    return new;
  exception when others then
    return new;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.set_updated_at()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
  AS $function$
  begin
    new.updated_at = now();
    return new;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.order_discount_payload_total(p_discount_data jsonb, p_customer_data jsonb)
   RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO ''
  AS $function$
    select case
      when jsonb_typeof(p_discount_data) = 'object'
       and jsonb_typeof(p_discount_data -> 'total') = 'number'
        then (p_discount_data ->> 'total')::numeric
      when jsonb_typeof(p_customer_data -> 'discount') = 'object'
       and jsonb_typeof(p_customer_data -> 'discount' -> 'total') = 'number'
        then (p_customer_data -> 'discount' ->> 'total')::numeric
    end
  $function$;

  CREATE OR REPLACE FUNCTION public.orders_sync_discount_total()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
  AS $function$
  declare
    v_blob jsonb := case
      when jsonb_typeof(new.customer_data -> 'discount') = 'object'
       and jsonb_typeof(new.customer_data -> 'discount' -> 'total') = 'number'
        then new.customer_data -> 'discount'
    end;
    v_total numeric;
  begin
    if tg_op = 'INSERT' then
      if public.order_discount_payload_total(new.discount_data, null) is null and v_blob is not null then
        new.discount_data := v_blob;
      end if;
    elsif new.discount_data is distinct from old.discount_data then
      if new.discount_data is null and jsonb_typeof(new.customer_data) = 'object' then
        new.customer_data := new.customer_data - 'discount';
      end if;
    elsif old.discount_data is null
      and v_blob is not null
      and (new.customer_data -> 'discount') is distinct from (old.customer_data -> 'discount') then
      new.discount_data := v_blob;
    end if;

    v_total := public.order_discount_payload_total(new.discount_data, null);
    new.discount_total := case
      when v_total is not null and v_total >= 0 and v_total < 99999999.995 then round(v_total, 2)
      else 0
    end;
    return new;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.enqueue_loyalty_earning_job()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
  declare source_backend text; source_id text;
  begin
    if not exists(select 1 from tenants where id=new.tenant_id and loyalty_enabled and not loyalty_shadow) then return new; end if;
    if tg_table_name='orders' then
      source_backend:='platform_supabase'; source_id:=new.id::text;
      if tg_op='UPDATE' and (to_jsonb(old)->'status',to_jsonb(old)->'payment_status',to_jsonb(old)->'customer_contact',to_jsonb(old)->'customer_data')
        is not distinct from (to_jsonb(new)->'status',to_jsonb(new)->'payment_status',to_jsonb(new)->'customer_contact',to_jsonb(new)->'customer_data') then return new; end if;
    else
      source_backend:=new.backend; source_id:=new.external_order_id;
      if tg_op='UPDATE' and (old.status,old.payment_status,old.customer_id) is not distinct from (new.status,new.payment_status,new.customer_id) then return new; end if;
    end if;
    insert into loyalty_earning_jobs(tenant_id,backend,external_order_id)
    values(new.tenant_id,source_backend,source_id)
    on conflict(tenant_id,backend,external_order_id) do update set
      revision=loyalty_earning_jobs.revision+1,next_attempt_at=now(),attempts=0,last_result=null,lease_token=null,lease_until=null;
    return new;
  end $function$;

  CREATE OR REPLACE FUNCTION public.sync_order_amount_paid()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
  declare
    target_order uuid := coalesce(new.order_id, old.order_id);
  begin
    update public.orders
    set amount_paid = coalesce((
          select sum(case when kind = 'refund' then -amount else amount end)
          from public.order_payments
          where order_id = target_order
        ), 0)
    where id = target_order;

    return null;
  end;
  $function$;

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
      IF parent_outlet IS NOT NULL THEN
        NEW.outlet_id := parent_outlet;
      END IF;
    END IF;

    RETURN NEW;
  END;
  $function$;

  CREATE OR REPLACE FUNCTION public.stamp_client_actor()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
  AS $function$
  begin
    if current_user in ('anon', 'authenticated') then
      new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid(), 'created_at', now()));
    end if;
    return new;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.order_ledger_append_only()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  begin
    if tg_op = 'UPDATE' then
      if new.outlet_id is null
         and old.outlet_id is not null
         and to_jsonb(new) - 'outlet_id' = to_jsonb(old) - 'outlet_id'
         and not exists (select 1 from public.outlets b where b.id = old.outlet_id) then
        return new;
      end if;
      raise exception '% rows are append-only: record a new row (a refund) instead of changing one', tg_table_name
        using errcode = '42501';
    end if;
    if exists (select 1 from public.orders o where o.id = old.order_id)
       and exists (select 1 from public.tenants t where t.id = old.tenant_id) then
      raise exception '% rows are append-only and cannot be deleted', tg_table_name
        using errcode = '42501';
    end if;
    return old;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.order_refund_insert_check(p_order_id uuid, p_amount numeric, p_is_client boolean)
   RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  declare
    v_order record;
    v_rows integer;
    v_charged numeric;
    v_refunded numeric;
    v_actor uuid := auth.uid();
    v_tenant uuid;
    v_outlet uuid;
  begin
    if v_actor is not null then
      select o.tenant_id, o.outlet_id into v_tenant, v_outlet from public.orders o where o.id = p_order_id;
      if v_tenant is null
         or not public.app_user_has_permission(v_tenant, 'order_refund')
         or not public.app_user_may_see_order(v_tenant, v_outlet) then
        raise exception 'This refund is not allowed on this order.' using errcode = '42501';
      end if;
      perform pg_advisory_xact_lock(public.approval_direct_lock_key(v_tenant, v_actor));
    end if;

    select o.id, o.tenant_id, o.total, o.payment_status, o.created_at
      into v_order
      from public.orders o where o.id = p_order_id
      for update;
    if not found then
      return;
    end if;

    select count(*),
           coalesce(sum(p.amount) filter (where p.kind = 'charge'), 0),
           coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0)
      into v_rows, v_charged, v_refunded
      from public.order_payments p where p.order_id = p_order_id;
    if v_rows = 0 and coalesce(v_order.payment_status, '') in ('paid', 'verified') then
      v_charged := v_order.total;
    end if;

    if v_refunded + p_amount > v_charged then
      raise exception 'This refund is more than was paid on this order.' using errcode = '23514';
    end if;

    if not coalesce(p_is_client, false) and v_actor is null then
      return;
    end if;

    if v_actor is null or not public.approval_refund_within_own_limit(
      v_order.tenant_id, v_actor, 'refund', p_amount, v_order.created_at, v_refunded
    ) then
      raise exception 'This refund needs approval. Ask a manager to approve it.' using errcode = '42501';
    end if;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.order_payments_refund_guard()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
  AS $function$
  begin
    perform public.order_refund_insert_check(new.order_id, new.amount, current_user in ('anon', 'authenticated'));
    return new;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.order_items_category_snapshot()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  begin
    if tg_op = 'UPDATE' and new.menu_item_id is not distinct from old.menu_item_id then
      new.category_name := old.category_name;
      return new;
    end if;

    new.category_name := null;
    if new.menu_item_id is null then return new; end if;

    select c.name into new.category_name
      from public.orders o
      join public.menu_items mi on mi.id = new.menu_item_id and mi.tenant_id = o.tenant_id
      join public.categories c on c.id = mi.category_id and c.tenant_id = o.tenant_id
     where o.id = new.order_id
     limit 1;
    return new;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.order_items_cost_snapshot()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  declare
    v_tenant_id uuid;
    v_recipe_id uuid;
    v_cost numeric;
    v_source text;
  begin
    if tg_op = 'UPDATE' and new.menu_item_id is not distinct from old.menu_item_id then
      return null;
    end if;

    begin
      select o.tenant_id into v_tenant_id from public.orders o where o.id = new.order_id;

      if v_tenant_id is not null and new.menu_item_id is not null then
        select r.id into v_recipe_id
          from public.recipes r
         where r.tenant_id = v_tenant_id
           and r.menu_item_id = new.menu_item_id
           and r.target_type = 'menu_item';

        if v_recipe_id is not null then
          v_cost := public.inventory_recipe_cost(v_tenant_id, v_recipe_id);
          if v_cost > 0 then v_source := 'recipe'; else v_cost := null; end if;
        end if;

        if v_cost is null then
          select pc.cost_price into v_cost
            from public.product_costs pc
           where pc.tenant_id = v_tenant_id
             and pc.menu_item_id = new.menu_item_id;
          if v_cost > 0 then v_source := 'manual'; else v_cost := null; end if;
        end if;
      end if;

      if v_cost is not null and v_cost < 100000000 then
        insert into public.order_item_costs (order_item_id, tenant_id, unit_cost, source)
        values (new.id, v_tenant_id, round(v_cost, 4), v_source)
        on conflict (order_item_id) do update
          set unit_cost = excluded.unit_cost, source = excluded.source, costed_at = now();
      elsif tg_op = 'UPDATE' then
        delete from public.order_item_costs where order_item_id = new.id;
      end if;
    exception when others then
      raise warning 'order_items_cost_snapshot(order item %): % (%)', new.id, sqlerrm, sqlstate;
    end;
    return null;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.stock_movement_count_session_is_valid()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
  AS $function$
  DECLARE
    v_status text;
    v_outlet uuid;
  BEGIN
    IF NEW.inventory_count_id IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'count sessions are not seeded in this runner';
  END;
  $function$;

  CREATE OR REPLACE FUNCTION public.store_activity_write(p_tenant_id uuid, p_kind text, p_event_key text, p_source_table text, p_source_id text, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_outlet_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_actor_name text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric, p_quantity numeric DEFAULT NULL::numeric, p_unit text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_subject_type text DEFAULT NULL::text, p_subject_ref text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_backend text DEFAULT NULL::text, p_external_order_id text DEFAULT NULL::text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb, p_summary jsonb DEFAULT '{}'::jsonb, p_flags text[] DEFAULT '{}'::text[])
   RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  declare
    v_at timestamptz := coalesce(p_occurred_at, now());
    v_flags text[] := coalesce(p_flags, '{}'::text[]);
    v_summary jsonb := coalesce(p_summary, '{}'::jsonb);
    v_backfill boolean := coalesce(current_setting('app.store_activity_backfill', true), '') = 'on';
    v_written integer;
    v_sensitive constant text[] := array[
      'order.cancelled', 'order.reopened', 'order.edited', 'order.deleted',
      'refund.issued', 'payment.recorded', 'payment.marked_paid', 'discount.applied',
      'cash.pay_out', 'cash.collected', 'stock.wasted', 'stock.adjusted', 'menu.price_changed',
      'expense.voided'
    ];
  begin
    if v_backfill then
      v_flags := array_remove(v_flags, 'after_hours');
    elsif p_kind = any (v_sensitive)
       and not ('after_hours' = any (v_flags))
       and public.store_activity_is_after_hours(p_tenant_id, p_outlet_id, v_at) then
      v_flags := v_flags || 'after_hours'::text;
    end if;
    if jsonb_typeof(v_summary -> 'title') = 'string' then
      v_summary := jsonb_set(v_summary, '{title}', to_jsonb(public.store_activity_scrub(v_summary ->> 'title')));
    end if;

    insert into public.store_activity (
      tenant_id, outlet_id, occurred_at, category, kind, is_routine,
      actor_user_id, actor_name, amount, quantity, unit, reason, note,
      subject_type, subject_ref, order_number, backend, external_order_id,
      before, after, summary, flags, source_table, source_id, event_key
    ) values (
      p_tenant_id, p_outlet_id, v_at, public.store_activity_category_of(p_kind), p_kind,
      public.store_activity_is_routine(p_kind),
      p_actor_user_id,
      coalesce(public.store_activity_actor_name(p_actor_user_id), nullif(btrim(p_actor_name), '')),
      round(p_amount, 2), p_quantity, p_unit,
      left(public.store_activity_scrub(nullif(btrim(p_reason), '')), 500),
      left(public.store_activity_scrub(nullif(btrim(p_note), '')), 1000),
      p_subject_type, p_subject_ref, p_order_number, p_backend, p_external_order_id,
      p_before, p_after, v_summary,
      array(select distinct f from unnest(v_flags) f order by f),
      p_source_table, p_source_id, p_event_key
    )
    on conflict (event_key) do nothing;
    get diagnostics v_written = row_count;
    if v_backfill and v_written > 0 then
      perform set_config('app.store_activity_written',
        (coalesce(nullif(current_setting('app.store_activity_written', true), ''), '0')::integer + v_written)::text, true);
    end if;
    return v_written > 0;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.store_activity_on_orders()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  declare
    v_actor uuid := public.store_activity_actor();
    v_label text := public.store_activity_order_label(new.daily_number, new.id::text);
    v_customer text := public.store_activity_mask_name(new.customer_name);
    v_stamp text;
    v_kind text;
    v_flags text[] := '{}'::text[];
    v_has_proof boolean;
    v_pay_kind text;
  begin
    if tg_op = 'INSERT' then
      perform public.store_activity_write(
        p_tenant_id => new.tenant_id, p_kind => 'order.placed',
        p_event_key => 'orders:' || new.id || ':placed',
        p_source_table => 'orders', p_source_id => new.id::text, p_occurred_at => new.created_at,
        p_outlet_id => new.outlet_id, p_actor_user_id => v_actor, p_amount => new.total,
        p_subject_type => 'order', p_subject_ref => new.id::text, p_order_number => v_label,
        p_backend => 'platform', p_external_order_id => new.id::text,
        p_after => jsonb_build_object('status', new.status, 'paymentStatus', new.payment_status),
        p_summary => jsonb_strip_nulls(jsonb_build_object(
          'title', case when new.source = 'pos' then 'Rang up ' || v_label else 'New order ' || v_label end,
          'customer', v_customer, 'source', new.source, 'orderType', new.order_type)));
      perform public.store_activity_record_order_discounts(new, null, v_actor, 'placed');
      return null;
    end if;
    -- The UPDATE branch (status / payment / discount changes) never runs during an
    -- import: the store_activity_orders_update trigger's WHEN clause skips the
    -- amount_paid-only updates that order_payments_sync_amount_paid makes.
    return null;
  exception when others then
    raise warning 'store_activity_on_orders failed: % (%)', sqlerrm, sqlstate;
    return null;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.store_activity_capture_order_payments(r order_payments)
   RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  declare
    v_order record;
    v_label text;
    v_kind text;
    v_flags text[] := '{}'::text[];
  begin
    select o.daily_number, o.created_at, o.outlet_id, o.total into v_order
    from public.orders o where o.id = r.order_id;
    v_label := public.store_activity_order_label(v_order.daily_number, r.order_id::text);

    if r.kind = 'refund' then
      v_kind := 'refund.issued';
      if public.store_activity_flag_cash_refund_noncash(r.order_id, r.payment_method_name, r.id) then
        v_flags := v_flags || 'cash_refund_noncash_order'::text;
      end if;
    elsif v_order.created_at is not null and r.created_at - v_order.created_at <= interval '10 minutes' then
      v_kind := 'payment.charged';
    else
      v_kind := 'payment.recorded';
    end if;

    perform public.store_activity_write(
      p_tenant_id => r.tenant_id, p_kind => v_kind,
      p_event_key => 'order_payments:' || r.id,
      p_source_table => 'order_payments', p_source_id => r.id::text, p_occurred_at => r.created_at,
      p_outlet_id => coalesce(r.outlet_id, v_order.outlet_id),
      p_actor_user_id => coalesce(r.recorded_by, public.store_activity_actor()),
      p_amount => case when r.kind = 'refund' then -r.amount else r.amount end,
      p_note => r.note,
      p_subject_type => 'order', p_subject_ref => r.order_id::text, p_order_number => v_label,
      p_backend => 'platform', p_external_order_id => r.order_id::text,
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', case v_kind
          when 'refund.issued' then 'Refunded ' || public.store_activity_peso(r.amount) || ' on ' || v_label
          else public.store_activity_peso(r.amount) || ' paid on ' || v_label end,
        'paymentMethod', r.payment_method_name,
        'reference', case when r.reference is not null then right(btrim(r.reference), 4) end,
        'orderTotal', v_order.total)),
      p_flags => v_flags);
    return;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.store_activity_on_order_payments()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  begin
    if exists (
      select 1 from public.order_refunds f
       where f.tenant_id = new.tenant_id
         and (new.id = any (f.payment_row_ids) or f.opening_payment_id = new.id)
    ) then
      return null;
    end if;
    perform public.store_activity_capture_order_payments(new);
    return null;
  exception when others then
    raise warning 'store_activity trigger (order_payments) failed: % (%)', sqlerrm, sqlstate;
    return null;
  end;
  $function$;

  CREATE OR REPLACE FUNCTION public.store_activity_on_order_revisions()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
  AS $function$
  begin
    if exists (select 1 from public.order_refunds f where f.revision_id = new.id) then
      return null;
    end if;
    perform public.store_activity_capture_order_revisions(new);
    return null;
  exception when others then
    raise warning 'store_activity trigger (order_revisions) failed: % (%)', sqlerrm, sqlstate;
    return null;
  end;
  $function$;

  -- ── Live trigger definitions (pg_get_triggerdef) ──
  CREATE TRIGGER order_items_category_snapshot BEFORE INSERT OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION order_items_category_snapshot();
  CREATE TRIGGER order_items_cost_snapshot AFTER INSERT OR UPDATE OF menu_item_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION order_items_cost_snapshot();
  CREATE TRIGGER order_payments_append_only BEFORE DELETE OR UPDATE ON public.order_payments FOR EACH ROW EXECUTE FUNCTION order_ledger_append_only();
  CREATE TRIGGER order_payments_inherit_branch BEFORE INSERT ON public.order_payments FOR EACH ROW EXECUTE FUNCTION order_child_inherit_branch();
  CREATE TRIGGER order_payments_refund_guard BEFORE INSERT ON public.order_payments FOR EACH ROW WHEN ((new.kind = 'refund'::text)) EXECUTE FUNCTION order_payments_refund_guard();
  CREATE TRIGGER order_payments_stamp_actor BEFORE INSERT ON public.order_payments FOR EACH ROW EXECUTE FUNCTION stamp_client_actor('recorded_by');
  CREATE TRIGGER order_payments_sync_amount_paid AFTER INSERT OR DELETE OR UPDATE ON public.order_payments FOR EACH ROW EXECUTE FUNCTION sync_order_amount_paid();
  CREATE TRIGGER order_revisions_append_only BEFORE DELETE OR UPDATE ON public.order_revisions FOR EACH ROW EXECUTE FUNCTION order_ledger_append_only();
  CREATE TRIGGER order_revisions_inherit_branch BEFORE INSERT ON public.order_revisions FOR EACH ROW EXECUTE FUNCTION order_child_inherit_branch();
  CREATE TRIGGER order_revisions_stamp_actor BEFORE INSERT ON public.order_revisions FOR EACH ROW EXECUTE FUNCTION stamp_client_actor('revised_by');
  CREATE TRIGGER orders_loyalty_recovery AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION enqueue_loyalty_earning_job();
  CREATE TRIGGER orders_messenger_order_update AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status = ANY (ARRAY['confirmed'::text, 'preparing'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text])) AND (new.customer_data ? 'messenger_psid'::text))) EXECUTE FUNCTION notify_messenger_order_update();
  CREATE TRIGGER orders_notify_push AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION notify_order_push();
  CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER orders_sync_discount_total BEFORE INSERT OR UPDATE OF discount_data, customer_data, discount_total ON public.orders FOR EACH ROW EXECUTE FUNCTION orders_sync_discount_total();
  CREATE TRIGGER store_activity_order_payments AFTER INSERT ON public.order_payments FOR EACH ROW EXECUTE FUNCTION store_activity_on_order_payments();
  CREATE TRIGGER store_activity_order_revisions AFTER INSERT ON public.order_revisions FOR EACH ROW EXECUTE FUNCTION store_activity_on_order_revisions();
  CREATE TRIGGER store_activity_orders_insert AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION store_activity_on_orders();
  CREATE TRIGGER store_activity_orders_update AFTER UPDATE OF status, payment_status, discount_data, discount_total ON public.orders FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old.payment_status IS DISTINCT FROM new.payment_status) OR (old.discount_data IS DISTINCT FROM new.discount_data) OR (old.discount_total IS DISTINCT FROM new.discount_total))) EXECUTE FUNCTION store_activity_on_orders();
  CREATE TRIGGER trg_assign_daily_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION assign_daily_order_number();
  CREATE TRIGGER trg_stock_movement_count_session BEFORE INSERT OR UPDATE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION stock_movement_count_session_is_valid();
`

module.exports = { LIVE_SCHEMA }
