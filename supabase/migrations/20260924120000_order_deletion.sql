-- Owner-initiated order deletion: export first, re-authenticate, 7-day recovery.
--
-- 1. Close the direct-delete door. `orders_write_admin` (and its twins on the
--    payment ledger and revision history) were FOR ALL, so any admin or staff
--    token could DELETE the store's orders straight through PostgREST. Order
--    editing still deletes replaced `order_items` rows, so that table keeps its
--    policy; the three tables below lose DELETE for client roles entirely.
--    Cascades from the deletion function below are unaffected: referential
--    actions do not check the caller's grants or policies.
-- 2. Deletion is only possible through `execute_order_deletion`, callable by the
--    service role alone, which re-checks that the actor owns the store and only
--    touches orders listed in that actor's own export ticket, in that store.
-- 3. Deleted orders are archived for 7 days (`restore_order_deletion`), then
--    erased by `purge_order_deletions`, run hourly by pg_cron (20260924130000).

-- ── 1. No client deletes on the order record ────────────────────────────────

drop policy if exists orders_write_admin on public.orders;
create policy orders_insert_admin on public.orders
  for insert with check (app_user_may_see_order(tenant_id, outlet_id));
create policy orders_update_admin on public.orders
  for update using (app_user_may_see_order(tenant_id, outlet_id))
  with check (app_user_may_see_order(tenant_id, outlet_id));

drop policy if exists order_payments_write_admin on public.order_payments;
create policy order_payments_insert_admin on public.order_payments
  for insert with check (app_user_may_see_order(tenant_id, outlet_id));
create policy order_payments_update_admin on public.order_payments
  for update using (app_user_may_see_order(tenant_id, outlet_id))
  with check (app_user_may_see_order(tenant_id, outlet_id));

drop policy if exists order_revisions_write_admin on public.order_revisions;
create policy order_revisions_insert_admin on public.order_revisions
  for insert with check (app_user_may_see_order(tenant_id, outlet_id));
create policy order_revisions_update_admin on public.order_revisions
  for update using (app_user_may_see_order(tenant_id, outlet_id))
  with check (app_user_may_see_order(tenant_id, outlet_id));

revoke delete on public.orders from anon, authenticated;
revoke delete on public.order_payments from anon, authenticated;
revoke delete on public.order_revisions from anon, authenticated;

-- ── 2. Tables (server-only) ─────────────────────────────────────────────────

-- One row per export ticket; it becomes the deletion when confirmed.
create table if not exists public.order_deletions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid not null,
  status text not null default 'exported'
    check (status in ('exported', 'deleted', 'restored', 'purged', 'expired')),
  scope jsonb not null,
  include_active boolean not null default false,
  order_ids uuid[] not null,
  order_count integer not null,
  order_total numeric not null,
  export_sha256 text not null check (export_sha256 ~ '^[0-9a-f]{64}$'),
  exported_at timestamptz not null,
  export_expires_at timestamptz not null,
  deleted_at timestamptz,
  deleted_order_count integer,
  deleted_total numeric,
  purge_after timestamptz,
  restored_at timestamptz,
  restored_by uuid,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  -- An expired ticket drops its order list; every other one lists what it counts.
  constraint order_deletions_ids_match_count check (
    status = 'expired' or (order_count > 0 and order_count = cardinality(order_ids))
  )
);
create index if not exists order_deletions_tenant_created_idx
  on public.order_deletions (tenant_id, created_at desc);
create index if not exists order_deletions_due_idx
  on public.order_deletions (purge_after) where status = 'deleted';

-- Full-fidelity copies of deleted orders, kept only through the recovery window.
create table if not exists public.order_deletion_archive (
  deletion_id uuid not null references public.order_deletions(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null,
  order_row jsonb not null,
  items jsonb not null default '[]'::jsonb,
  payments jsonb not null default '[]'::jsonb,
  revisions jsonb not null default '[]'::jsonb,
  primary key (deletion_id, order_id)
);

-- Every export, refusal, deletion, restore and purge. Append-only.
create table if not exists public.order_deletion_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid,
  action text not null check (action in (
    'exported', 'password_failed', 'confirmation_failed', 'deleted', 'restored', 'purged'
  )),
  deletion_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_deletion_audit_actor_idx
  on public.order_deletion_audit (actor_id, action, created_at desc);
create index if not exists order_deletion_audit_tenant_idx
  on public.order_deletion_audit (tenant_id, created_at desc);

alter table public.order_deletions enable row level security;
alter table public.order_deletion_archive enable row level security;
alter table public.order_deletion_audit enable row level security;
revoke all on table public.order_deletions from public, anon, authenticated;
revoke all on table public.order_deletion_archive from public, anon, authenticated;
revoke all on table public.order_deletion_audit from public, anon, authenticated;
grant select, insert, update on public.order_deletions to service_role;
grant select on public.order_deletion_archive to service_role;
grant select, insert on public.order_deletion_audit to service_role;

create or replace function public.order_deletion_audit_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  -- A tenant being deleted takes its audit rows with it; nothing else may.
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants where id = old.tenant_id) then
    return old;
  end if;
  raise exception 'order_deletion_audit is append-only';
end $$;

drop trigger if exists order_deletion_audit_append_only on public.order_deletion_audit;
create trigger order_deletion_audit_append_only
  before update or delete on public.order_deletion_audit
  for each row execute function public.order_deletion_audit_append_only();

-- ── 3. Restores must not renumber or re-ring an order ───────────────────────
-- `app.order_restore` is set transaction-locally by restore_order_deletion only.
-- Client roles cannot set arbitrary settings through PostgREST.

create or replace function public.assign_daily_order_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare zone text;
begin
  -- A restored order keeps the number the kitchen and the customer saw — or
  -- none, for orders placed before daily numbers existed. Restoring must not
  -- draw from today's counter.
  if current_setting('app.order_restore', true) = 'on' then
    return new;
  end if;
  select coalesce(timezone, 'Asia/Manila') into zone from tenants where id = new.tenant_id;
  new.order_date := (coalesce(new.created_at, now()) at time zone coalesce(zone, 'Asia/Manila'))::date;
  -- Never trust a caller-supplied display number or let it bypass the counter.
  new.daily_number := next_daily_order_number(new.tenant_id, new.order_date);
  return new;
end $$;

create or replace function public.notify_order_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
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
end $$;

-- ── 4. Functions (service role only) ────────────────────────────────────────

create or replace function public.execute_order_deletion(p_deletion_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_deletion public.order_deletions%rowtype;
  v_ids uuid[];
  v_count integer;
  v_total numeric;
  v_purge_after timestamptz := now() + interval '7 days';
begin
  select * into v_deletion from public.order_deletions where id = p_deletion_id for update;
  if not found then
    raise exception 'order_deletion_not_found' using errcode = 'P0002';
  end if;
  if v_deletion.requested_by is distinct from p_actor
     or not exists (
       select 1 from public.app_users au
       where au.user_id = p_actor and au.role = 'admin' and au.is_owner = true
         and au.tenant_id = v_deletion.tenant_id
     ) then
    raise exception 'order_deletion_forbidden' using errcode = '42501';
  end if;
  if v_deletion.status <> 'exported' then
    raise exception 'order_deletion_used' using errcode = 'P0001';
  end if;
  if v_deletion.export_expires_at <= now() then
    raise exception 'order_deletion_expired' using errcode = 'P0001';
  end if;

  -- Exactly the exported orders, in this store, unchanged since the export.
  -- Loyalty-settled orders stay: their settlement reads the order back.
  select coalesce(array_agg(id), '{}') into v_ids from (
    select o.id from public.orders o
    where o.tenant_id = v_deletion.tenant_id
      and o.id = any(v_deletion.order_ids)
      and o.updated_at <= v_deletion.exported_at
      and not exists (select 1 from public.loyalty_projected_receipts r where r.order_id = o.id)
    for update of o
  ) locked;

  insert into public.order_deletion_archive (deletion_id, tenant_id, order_id, order_row, items, payments, revisions)
  select v_deletion.id, o.tenant_id, o.id, to_jsonb(o),
    coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(p)) from public.order_payments p where p.order_id = o.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(r)) from public.order_revisions r where r.order_id = o.id), '[]'::jsonb)
  from public.orders o
  where o.tenant_id = v_deletion.tenant_id and o.id = any(v_ids);

  select count(*), coalesce(sum(total), 0) into v_count, v_total
  from public.orders where tenant_id = v_deletion.tenant_id and id = any(v_ids);

  delete from public.orders where tenant_id = v_deletion.tenant_id and id = any(v_ids);

  update public.order_deletions
  set status = 'deleted', deleted_at = now(), deleted_order_count = v_count,
      deleted_total = v_total, purge_after = v_purge_after
  where id = v_deletion.id;

  insert into public.order_deletion_audit (tenant_id, actor_id, action, deletion_id, detail)
  values (v_deletion.tenant_id, p_actor, 'deleted', v_deletion.id,
    jsonb_build_object('deleted', v_count, 'total', v_total,
      'skipped', v_deletion.order_count - v_count, 'scope', v_deletion.scope));

  return jsonb_build_object(
    'deleted', v_count,
    'skipped', v_deletion.order_count - v_count,
    'total', v_total,
    'purgeAfter', v_purge_after
  );
end $$;
revoke all on function public.execute_order_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.execute_order_deletion(uuid, uuid) to service_role;

create or replace function public.restore_order_deletion(p_deletion_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_deletion public.order_deletions%rowtype;
  v_count integer;
begin
  select * into v_deletion from public.order_deletions where id = p_deletion_id for update;
  if not found then
    raise exception 'order_deletion_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.app_users au
    where au.user_id = p_actor and au.role = 'admin' and au.is_owner = true
      and au.tenant_id = v_deletion.tenant_id
  ) then
    raise exception 'order_deletion_forbidden' using errcode = '42501';
  end if;
  if v_deletion.status <> 'deleted' or v_deletion.purge_after <= now() then
    raise exception 'order_deletion_not_restorable' using errcode = 'P0001';
  end if;

  perform set_config('app.order_restore', 'on', true);

  -- References deleted during the window (a retired order type, a closed
  -- branch, a removed dish) are cleared; the frozen names on the row remain.
  insert into public.orders
  select (jsonb_populate_record(null::public.orders,
    a.order_row || jsonb_build_object(
      'tenant_id', v_deletion.tenant_id,
      'order_type_id', case when exists (select 1 from public.order_types t
        where t.id = (a.order_row->>'order_type_id')::uuid) then a.order_row->'order_type_id' else 'null'::jsonb end,
      'payment_method_id', case when exists (select 1 from public.payment_methods m
        where m.id = (a.order_row->>'payment_method_id')::uuid) then a.order_row->'payment_method_id' else 'null'::jsonb end,
      'outlet_id', case when exists (select 1 from public.outlets b
        where b.id = (a.order_row->>'outlet_id')::uuid and b.tenant_id = v_deletion.tenant_id)
        then a.order_row->'outlet_id' else 'null'::jsonb end,
      'customer_id', case when exists (select 1 from public.customers c
        where c.id = (a.order_row->>'customer_id')::uuid) then a.order_row->'customer_id' else 'null'::jsonb end
    ))).*
  from public.order_deletion_archive a
  where a.deletion_id = v_deletion.id and a.tenant_id = v_deletion.tenant_id;
  get diagnostics v_count = row_count;

  insert into public.order_items
  select (jsonb_populate_record(null::public.order_items,
    item || jsonb_build_object(
      'menu_item_id', case when exists (select 1 from public.menu_items m
        where m.id = (item->>'menu_item_id')::uuid) then item->'menu_item_id' else 'null'::jsonb end
    ))).*
  from public.order_deletion_archive a, jsonb_array_elements(a.items) item
  where a.deletion_id = v_deletion.id and a.tenant_id = v_deletion.tenant_id;

  insert into public.order_payments
  select (jsonb_populate_record(null::public.order_payments,
    payment || jsonb_build_object(
      'tenant_id', v_deletion.tenant_id,
      'outlet_id', case when exists (select 1 from public.outlets b
        where b.id = (payment->>'outlet_id')::uuid and b.tenant_id = v_deletion.tenant_id)
        then payment->'outlet_id' else 'null'::jsonb end
    ))).*
  from public.order_deletion_archive a, jsonb_array_elements(a.payments) payment
  where a.deletion_id = v_deletion.id and a.tenant_id = v_deletion.tenant_id;

  insert into public.order_revisions
  select (jsonb_populate_record(null::public.order_revisions,
    revision || jsonb_build_object(
      'tenant_id', v_deletion.tenant_id,
      'outlet_id', case when exists (select 1 from public.outlets b
        where b.id = (revision->>'outlet_id')::uuid and b.tenant_id = v_deletion.tenant_id)
        then revision->'outlet_id' else 'null'::jsonb end
    ))).*
  from public.order_deletion_archive a, jsonb_array_elements(a.revisions) revision
  where a.deletion_id = v_deletion.id and a.tenant_id = v_deletion.tenant_id;

  delete from public.order_deletion_archive where deletion_id = v_deletion.id;

  update public.order_deletions
  set status = 'restored', restored_at = now(), restored_by = p_actor
  where id = v_deletion.id;

  insert into public.order_deletion_audit (tenant_id, actor_id, action, deletion_id, detail)
  values (v_deletion.tenant_id, p_actor, 'restored', v_deletion.id, jsonb_build_object('restored', v_count));

  return jsonb_build_object('restored', v_count);
end $$;
revoke all on function public.restore_order_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_order_deletion(uuid, uuid) to service_role;

create or replace function public.purge_order_deletions()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_purged integer;
  v_expired integer;
begin
  with due as (
    update public.order_deletions
    set status = 'purged', purged_at = now()
    where status = 'deleted' and purge_after <= now()
    returning id, tenant_id, deleted_order_count
  ), audited as (
    insert into public.order_deletion_audit (tenant_id, actor_id, action, deletion_id, detail)
    select tenant_id, null, 'purged', id, jsonb_build_object('orders', deleted_order_count) from due
    returning deletion_id
  )
  delete from public.order_deletion_archive where deletion_id in (select deletion_id from audited);
  get diagnostics v_purged = row_count;

  -- Unused export tickets: drop the order list, keep the record.
  update public.order_deletions
  set status = 'expired', order_ids = '{}'
  where status = 'exported' and export_expires_at <= now();
  get diagnostics v_expired = row_count;

  return jsonb_build_object('purgedOrders', v_purged, 'expiredExports', v_expired);
end $$;
revoke all on function public.purge_order_deletions() from public, anon, authenticated;
grant execute on function public.purge_order_deletions() to service_role;
