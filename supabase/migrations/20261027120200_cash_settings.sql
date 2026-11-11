-- ===========================================================================
-- Cash rules and named shifts (P0 of docs/plans/cashier-remittance,
-- CONTRACTS.md §2, 07 §3.2).
--
--   schema cash                  internal helpers (NOT in PostgREST's exposed
--                                schemas, like `reporting`). Usage is granted
--                                so client-role triggers can call the pure
--                                helpers; each function's EXECUTE is decided
--                                one by one.
--   cash.tenant_order_backend    SQL twin of resolveOrderBackend
--                                (src/lib/order-backend.ts). Change both;
--                                tests/unit/cash/order-backend-sql-parity.test.ts
--   tenant_cash_settings         one row per store; NO ROW = the defaults
--   cash.settings_of / get_cash_settings / save_cash_settings
--   service_periods              named shifts ("Day shift 12 PM–8 PM"),
--                                store-wide or per branch, archived never deleted
--
-- Runner: tests/sql/run-cash-settings.cjs.
-- ===========================================================================

set lock_timeout = '3s';

create schema if not exists cash;
revoke all on schema cash from public, anon;
grant usage on schema cash to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Twin of resolveOrderBackend: a recognised pin (exact, case-sensitive) wins;
-- anything else derives from the Convex deployment URL after a JS-style trim
-- (String.prototype.trim: ASCII whitespace, NBSP, the Unicode Zs spaces,
-- U+2028/2029 and the BOM — spelled out, because [[:space:]] depends on the
-- locale). NULL for an unknown store.
-- ---------------------------------------------------------------------------
create or replace function cash.tenant_order_backend(p_tenant uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when t.order_backend in ('convex', 'supabase', 'platform') then t.order_backend
           when coalesce(t.convex_deployment_url, '')
                !~ '^[\t\n\v\f\r    -     　﻿]*$' then 'convex'
           else 'platform'
         end
    from public.tenants t
   where t.id = p_tenant;
$$;

comment on function cash.tenant_order_backend(uuid) is
  'SQL twin of resolveOrderBackend (src/lib/order-backend.ts): pin convex|supabase|platform wins, else a non-blank convex_deployment_url = convex, else platform. Change both.';

revoke all on function cash.tenant_order_backend(uuid) from public, anon, authenticated;
grant execute on function cash.tenant_order_backend(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- tenant_cash_settings
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_cash_settings (
  tenant_id                  uuid primary key references public.tenants(id) on delete cascade,
  -- Hide expected cash from cashiers until they have counted (snapshotted per shift).
  blind_close                boolean not null default false,
  -- Counting bills and coins is required at close (else optional).
  require_denominations      boolean not null default false,
  -- Ask for a reason when |counted − expected| is MORE than this (₱20).
  variance_reason_from_cents integer not null default 2000,
  remittance_mode            text not null default 'optional',
  -- The first Charge without a shift opens Start shift.
  require_shift_to_sell      boolean not null default false,
  -- How long after the business day ends an open shift counts as overdue.
  overdue_grace_minutes      integer not null default 240,
  -- Usual starting float; NULL = each drawer's own.
  default_float_cents        bigint,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users(id) on delete set null,
  updated_by_name            text,
  constraint tenant_cash_settings_reason_ck check (variance_reason_from_cents between 0 and 100000),
  constraint tenant_cash_settings_remit_ck check (remittance_mode in ('off', 'optional', 'required')),
  constraint tenant_cash_settings_grace_ck check (overdue_grace_minutes between 30 and 1440),
  constraint tenant_cash_settings_float_ck check (default_float_cents is null or default_float_cents between 0 and 100000000)
);

comment on table public.tenant_cash_settings is
  'The store''s cash rules. No row = defaults (blind off, counting optional, reason above ₱20, remittance optional, selling without a shift allowed, overdue 4 h after the day ends). Written only by save_cash_settings.';

alter table public.tenant_cash_settings enable row level security;

-- Every member of the store reads the rules (the register needs them);
-- branch-locked staff included. No client write policy.
drop policy if exists tenant_cash_settings_read on public.tenant_cash_settings;
create policy tenant_cash_settings_read on public.tenant_cash_settings for select to authenticated
  using (public.app_user_belongs_to_store(tenant_id));

revoke all on public.tenant_cash_settings from anon, authenticated;
grant select on public.tenant_cash_settings to authenticated;
grant all on public.tenant_cash_settings to service_role;

-- The store's rules with every default filled in (no row = defaults).
create or replace function cash.settings_of(p_tenant uuid)
returns public.tenant_cash_settings
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s from public.tenant_cash_settings s where s.tenant_id = p_tenant),
    row(p_tenant, false, false, 2000, 'optional', false, 240, null::bigint, null::timestamptz, null::uuid, null::text)::public.tenant_cash_settings
  );
$$;
revoke all on function cash.settings_of(uuid) from public, anon, authenticated;
grant execute on function cash.settings_of(uuid) to service_role;

-- The §5 JSON (camelCase).
create or replace function cash.settings_json(s public.tenant_cash_settings)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'blindClose', s.blind_close,
    'requireDenominations', s.require_denominations,
    'varianceReasonFromCents', s.variance_reason_from_cents,
    'remittanceMode', s.remittance_mode,
    'requireShiftToSell', s.require_shift_to_sell,
    'overdueGraceMinutes', s.overdue_grace_minutes,
    'defaultFloatCents', s.default_float_cents,
    'updatedAt', s.updated_at,
    'updatedByName', s.updated_by_name);
$$;
revoke all on function cash.settings_json(public.tenant_cash_settings) from public, anon, authenticated;
grant execute on function cash.settings_json(public.tenant_cash_settings) to service_role;

-- A JSON whole number as numeric, else NULL (a string, a fraction, a bool).
-- Never raises: callers range-check the result.
create or replace function cash.json_whole(p_value jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    return null;
  end if;
  v := (p_value #>> '{}')::numeric;
  return case when v = trunc(v) then v end;
end;
$$;
grant execute on function cash.json_whole(jsonb) to authenticated, service_role;

-- get_cash_settings: the rules with defaults, for any member of the store.
create or replace function public.get_cash_settings(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.app_user_belongs_to_store(p_tenant) then
    raise exception 'Only this store''s staff can read its cash rules.' using errcode = '42501';
  end if;
  return cash.settings_json(cash.settings_of(p_tenant));
end;
$$;
revoke all on function public.get_cash_settings(uuid) from public, anon;
grant execute on function public.get_cash_settings(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- save_cash_settings(p_tenant, p_settings) → the saved rules as §5 JSON.
-- A PATCH: keys left out keep their value. Keys are the table's column
-- names (both clients send these); the camelCase spelling of each is
-- accepted too. Any other key, or a value of the wrong kind or out of range,
-- is refused (22023) — nothing is saved.
-- Who: cash_manage on a store-wide account (the rules cover every branch).
-- ---------------------------------------------------------------------------
create or replace function public.save_cash_settings(p_tenant uuid, p_settings jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.tenant_cash_settings;
  v_new public.tenant_cash_settings;
  v_key text;
  v_value jsonb;
  v_column text;
  v_aliases constant jsonb := jsonb_build_object(
    'blindClose', 'blind_close', 'requireDenominations', 'require_denominations',
    'varianceReasonFromCents', 'variance_reason_from_cents', 'remittanceMode', 'remittance_mode',
    'requireShiftToSell', 'require_shift_to_sell', 'overdueGraceMinutes', 'overdue_grace_minutes',
    'defaultFloatCents', 'default_float_cents');
  v_columns constant text[] := array['blind_close', 'require_denominations', 'variance_reason_from_cents',
    'remittance_mode', 'require_shift_to_sell', 'overdue_grace_minutes', 'default_float_cents'];
  v_seen text[] := '{}';
  v_changed text[] := '{}';
  v_name text;
begin
  if p_tenant is null then
    raise exception 'Saving cash rules needs a store.' using errcode = '22023';
  end if;
  if v_uid is null
     or not public.app_user_manages_cash(p_tenant)
     or not exists (
       select 1 from public.app_users au
        where au.user_id = v_uid
          and (au.role = 'superadmin'
               or (au.tenant_id = p_tenant and (au.outlet_id is null or coalesce(au.is_owner, false))))
     ) then
    raise exception 'Only the owner or someone who handles cash can change these rules.' using errcode = '42501';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Cash rules must be an object.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant) then
    raise exception 'Store not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cash-settings:' || p_tenant::text, 0));
  v_old := cash.settings_of(p_tenant);
  v_new := v_old;

  for v_key, v_value in select e.key, e.value from jsonb_each(p_settings) e loop
    v_column := coalesce(v_aliases ->> v_key, v_key);
    if not (v_column = any (v_columns)) then
      raise exception 'Unknown cash rule: %', v_key using errcode = '22023';
    end if;
    if v_column = any (v_seen) then
      raise exception 'Cash rule given twice: %', v_column using errcode = '22023';
    end if;
    v_seen := v_seen || v_column;
    case v_column
      when 'blind_close', 'require_denominations', 'require_shift_to_sell' then
        if jsonb_typeof(v_value) <> 'boolean' then
          raise exception '% must be true or false.', v_key using errcode = '22023';
        end if;
      when 'remittance_mode' then
        if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') not in ('off', 'optional', 'required') then
          raise exception 'remittance_mode must be off, optional or required.' using errcode = '22023';
        end if;
      when 'default_float_cents' then
        if jsonb_typeof(v_value) <> 'null'
           and coalesce(cash.json_whole(v_value) not between 0 and 100000000, true) then
          raise exception 'default_float_cents must be whole centavos between 0 and 100000000, or null.' using errcode = '22023';
        end if;
      when 'variance_reason_from_cents' then
        if coalesce(cash.json_whole(v_value) not between 0 and 100000, true) then
          raise exception '% must be whole centavos between 0 and 100000.', v_key using errcode = '22023';
        end if;
      else  -- overdue_grace_minutes
        if coalesce(cash.json_whole(v_value) not between 30 and 1440, true) then
          raise exception '% must be whole minutes between 30 and 1440.', v_key using errcode = '22023';
        end if;
    end case;
    case v_column
      when 'blind_close' then v_new.blind_close := (v_value #>> '{}')::boolean;
      when 'require_denominations' then v_new.require_denominations := (v_value #>> '{}')::boolean;
      when 'require_shift_to_sell' then v_new.require_shift_to_sell := (v_value #>> '{}')::boolean;
      when 'remittance_mode' then v_new.remittance_mode := v_value #>> '{}';
      when 'variance_reason_from_cents' then v_new.variance_reason_from_cents := (v_value #>> '{}')::integer;
      when 'overdue_grace_minutes' then v_new.overdue_grace_minutes := (v_value #>> '{}')::integer;
      else v_new.default_float_cents := (v_value #>> '{}')::bigint;
    end case;
  end loop;

  select array_agg(k order by k) into v_changed
    from jsonb_each(cash.settings_json(v_new) - 'updatedAt' - 'updatedByName') n(k, v)
   where n.v is distinct from (cash.settings_json(v_old) -> n.k);
  if coalesce(cardinality(v_changed), 0) = 0 then
    return cash.settings_json(v_old);
  end if;

  v_name := (select left(nullif(btrim(coalesce(nullif(btrim(au.display_name), ''), split_part(coalesce(au.email, ''), '@', 1))), ''), 80)
               from public.app_users au where au.user_id = v_uid limit 1);
  insert into public.tenant_cash_settings as s (
    tenant_id, blind_close, require_denominations, variance_reason_from_cents, remittance_mode,
    require_shift_to_sell, overdue_grace_minutes, default_float_cents, updated_at, updated_by, updated_by_name)
  values (p_tenant, v_new.blind_close, v_new.require_denominations, v_new.variance_reason_from_cents, v_new.remittance_mode,
    v_new.require_shift_to_sell, v_new.overdue_grace_minutes, v_new.default_float_cents, now(), v_uid, v_name)
  on conflict (tenant_id) do update set
    blind_close = excluded.blind_close, require_denominations = excluded.require_denominations,
    variance_reason_from_cents = excluded.variance_reason_from_cents, remittance_mode = excluded.remittance_mode,
    require_shift_to_sell = excluded.require_shift_to_sell, overdue_grace_minutes = excluded.overdue_grace_minutes,
    default_float_cents = excluded.default_float_cents, updated_at = excluded.updated_at,
    updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name
  returning s.* into v_new;

  perform public.store_activity_record(
    p_tenant_id => p_tenant, p_kind => 'settings.changed',
    p_event_key => 'tenant_cash_settings:' || p_tenant::text || ':' || gen_random_uuid()::text,
    p_source_table => 'tenant_cash_settings', p_source_id => p_tenant::text,
    p_occurred_at => now(), p_actor_user_id => v_uid, p_actor_name => v_name,
    p_subject_type => 'setting', p_subject_ref => 'cash_rules',
    p_before => (select jsonb_object_agg(k, cash.settings_json(v_old) -> k) from unnest(v_changed) k),
    p_after => (select jsonb_object_agg(k, cash.settings_json(v_new) -> k) from unnest(v_changed) k),
    p_summary => jsonb_build_object('title', 'Cash rules changed', 'changedKeys', to_jsonb(v_changed)));

  return cash.settings_json(v_new);
end;
$$;

comment on function public.save_cash_settings(uuid, jsonb) is
  'cash_manage on a store-wide account: patch the store''s cash rules (column-name or camelCase keys; unknown keys refused, 22023). Returns the saved rules as camelCase JSON.';

revoke all on function public.save_cash_settings(uuid, jsonb) from public, anon;
grant execute on function public.save_cash_settings(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- service_periods — named shifts. Minutes from local midnight;
-- ends <= starts means the period ends the next day (8 PM–2 AM). The window
-- of a period on business day D is built by service-periods.ts (both twins).
-- ---------------------------------------------------------------------------
create table if not exists public.service_periods (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  -- NULL = every branch.
  outlet_id      uuid references public.outlets(id) on delete restrict,
  name           text not null,
  starts_minutes smallint not null,
  ends_minutes   smallint not null,
  sort           smallint not null default 0,
  -- Archived, never deleted: past shift reports name it.
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  constraint service_periods_name_ck check (char_length(btrim(name)) between 1 and 40),
  constraint service_periods_starts_ck check (starts_minutes between 0 and 1439),
  constraint service_periods_ends_ck check (ends_minutes between 0 and 1439)
);

comment on table public.service_periods is
  'Named shifts (service periods): "Day shift 12 PM–8 PM". Store-wide (outlet_id NULL) or one branch; ends <= starts = ends the next day. Archived, never deleted.';

create unique index if not exists service_periods_live_name
  on public.service_periods (tenant_id, coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  where archived_at is null;
create index if not exists service_periods_tenant on public.service_periods (tenant_id, sort);

-- The branch is the store's; the store never changes; the server stamps who
-- and when for client roles; an archived period is frozen.
create or replace function public.service_periods_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.outlet_id is not null and not exists (
    select 1 from public.outlets o where o.id = new.outlet_id and o.tenant_id = new.tenant_id
  ) then
    raise exception 'That branch belongs to a different store.' using errcode = '42501';
  end if;
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then
      new.created_by := auth.uid();
      new.created_at := now();
      new.archived_at := null;
    end if;
    return new;
  end if;
  if old.archived_at is not null then
    raise exception 'This shift was removed and can no longer change.' using errcode = '42501';
  end if;
  if new.tenant_id is distinct from old.tenant_id or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'A shift cannot move to another store.' using errcode = '42501';
  end if;
  if new.archived_at is not null and current_user in ('anon', 'authenticated') then
    new.archived_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists service_periods_guard on public.service_periods;
create trigger service_periods_guard before insert or update on public.service_periods
  for each row execute function public.service_periods_guard();

alter table public.service_periods enable row level security;

-- Read: any member; a branch-locked account sees the every-branch periods and
-- its own branch's.
drop policy if exists service_periods_read on public.service_periods;
create policy service_periods_read on public.service_periods for select to authenticated
  using (public.app_user_belongs_to_store(tenant_id)
         and (outlet_id is null or public.app_user_may_reach_branch(tenant_id, outlet_id)));

-- Write: cash_manage; an every-branch period needs a store-wide account.
drop policy if exists service_periods_insert on public.service_periods;
create policy service_periods_insert on public.service_periods for insert to authenticated
  with check (public.app_user_manages_cash(tenant_id) and public.app_user_may_reach_branch(tenant_id, outlet_id));
drop policy if exists service_periods_update on public.service_periods;
create policy service_periods_update on public.service_periods for update to authenticated
  using (public.app_user_manages_cash(tenant_id) and public.app_user_may_reach_branch(tenant_id, outlet_id))
  with check (public.app_user_manages_cash(tenant_id) and public.app_user_may_reach_branch(tenant_id, outlet_id));
-- No DELETE policy: archive instead.

revoke all on public.service_periods from anon, authenticated;
grant select, insert, update on public.service_periods to authenticated;
grant all on public.service_periods to service_role;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- drop table if exists public.service_periods;
-- drop function if exists public.service_periods_guard();
-- drop function if exists public.save_cash_settings(uuid, jsonb);
-- drop function if exists public.get_cash_settings(uuid);
-- drop table if exists public.tenant_cash_settings;   (cascades cash.settings_of / settings_json)
-- drop schema if exists cash cascade;
