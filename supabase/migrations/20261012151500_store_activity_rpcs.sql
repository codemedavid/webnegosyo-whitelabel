-- Store activity — the read RPCs (contract: docs/plans/store-activity/contract.md)
--
--   get_store_activity           keyset page (≤100) of visible rows, newest first
--   get_store_activity_summary   roll-ups for a window (≤93 days, Asia/Manila days)
--   mark_store_activity_reviewed sets reviewed_* once (idempotent)
--
-- Visibility is decided HERE from auth.uid(), never by the client:
--   * caller must be an admin of p_tenant_id or a superadmin;
--   * own rows (actor_user_id = caller) are always visible;
--   * other rows need owner / superadmin / activity_view / approve_requests, and a
--     branch-locked account sees only its branch + store-wide (NULL outlet) rows;
--   * category 'team' is owner / superadmin only;
--   * flags are PRIVATE: a caller without the full view gets flags = '{}' and no
--     reviewed_* on their own rows; p_flagged_only returns nothing for them;
--   * p_outlet_id only ever NARROWS.
-- Customer data is already masked in summary at write time.

-- ============================================
-- Caller scope (internal)
-- ============================================
create or replace function public.store_activity_caller_scope(
  p_tenant_id uuid,
  out o_uid uuid, out o_owner boolean, out o_full boolean, out o_branch uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_tenant uuid;
  v_is_owner boolean;
  v_outlet uuid;
begin
  o_uid := auth.uid();
  if o_uid is null or p_tenant_id is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select au.role, au.tenant_id, coalesce(au.is_owner, false), au.outlet_id
    into v_role, v_tenant, v_is_owner, v_outlet
  from public.app_users au where au.user_id = o_uid limit 1;
  if v_role is null or not (v_role = 'superadmin' or (v_role = 'admin' and v_tenant = p_tenant_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  o_owner := v_role = 'superadmin' or v_is_owner;
  o_full := o_owner
    or public.app_user_has_permission(p_tenant_id, 'activity_view')
    or public.app_user_has_permission(p_tenant_id, 'approve_requests');
  o_branch := case when o_owner then null else v_outlet end;
end;
$$;

-- The visibility rule, once (used by both read RPCs).
create or replace function public.store_activity_row_visible(
  p_category text, p_actor uuid, p_outlet uuid,
  p_uid uuid, p_owner boolean, p_full boolean, p_branch uuid
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p_category <> 'team' or p_owner)
    and (
      p_actor is not distinct from p_uid
      or (p_full and (p_branch is null or p_outlet is null or p_outlet = p_branch))
    )
$$;

-- ============================================
-- get_store_activity
-- ============================================
create or replace function public.get_store_activity(
  p_tenant_id uuid,
  p_limit integer default 50,
  p_before_occurred_at timestamptz default null,
  p_before_id uuid default null,
  p_since timestamptz default null,
  p_until timestamptz default null,
  p_categories text[] default null,
  p_outlet_id uuid default null,
  p_actor_user_id uuid default null,
  p_flagged_only boolean default false,
  p_include_routine boolean default false,
  p_search text default null,
  p_subject_type text default null,
  p_subject_ref text default null
)
returns table (
  id uuid, outlet_id uuid, outlet_name text, occurred_at timestamptz, category text, kind text,
  is_routine boolean, actor_user_id uuid, actor_name text, approved_by_name text, amount numeric,
  quantity numeric, unit text, reason text, note text, subject_type text, subject_ref text,
  order_number text, before jsonb, after jsonb, summary jsonb, flags text[],
  reviewed_at timestamptz, reviewed_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_search text := nullif(btrim(left(coalesce(p_search, ''), 80)), '');
  v_pattern text;
  v_since timestamptz := p_since;
begin
  select * into s from public.store_activity_caller_scope(p_tenant_id);
  if coalesce(p_flagged_only, false) and not s.o_full then
    return;
  end if;
  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- A text search is bounded to the last 93 days unless the caller chose a window.
    v_since := coalesce(v_since, now() - interval '93 days');
  end if;

  return query
  select a.id, a.outlet_id, o.name, a.occurred_at, a.category, a.kind,
         a.is_routine, a.actor_user_id, a.actor_name, a.approved_by_name, a.amount,
         a.quantity, a.unit, a.reason, a.note, a.subject_type, a.subject_ref,
         a.order_number, a.before, a.after, a.summary,
         case when s.o_full then a.flags else '{}'::text[] end,
         case when s.o_full then a.reviewed_at end,
         case when s.o_full then a.reviewed_by_name end
  from public.store_activity a
  left join public.outlets o on o.id = a.outlet_id
  where a.tenant_id = p_tenant_id
    and public.store_activity_row_visible(a.category, a.actor_user_id, a.outlet_id, s.o_uid, s.o_owner, s.o_full, s.o_branch)
    and (p_before_occurred_at is null
         or a.occurred_at < p_before_occurred_at
         or (p_before_id is not null and a.occurred_at = p_before_occurred_at and a.id < p_before_id))
    and (v_since is null or a.occurred_at >= v_since)
    and (p_until is null or a.occurred_at < p_until)
    and (p_categories is null or a.category = any (p_categories))
    and (p_outlet_id is null or a.outlet_id = p_outlet_id)
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (not coalesce(p_flagged_only, false) or a.flags <> '{}'::text[])
    and (coalesce(p_include_routine, false) or not a.is_routine)
    and (p_subject_type is null or a.subject_type = p_subject_type)
    and (p_subject_ref is null or a.subject_ref = p_subject_ref)
    and (v_pattern is null
         or a.order_number ilike v_pattern
         or (a.summary ->> 'title') ilike v_pattern
         or a.reason ilike v_pattern)
  order by a.occurred_at desc, a.id desc
  limit v_limit;
end;
$$;

-- ============================================
-- get_store_activity_summary
-- ============================================
-- { byKind:  [{kind, statutory, count, amount, quantity}],
--   byActor: [{actorUserId, actorName, kind, count, amount}],
--   byDay:   [{day, kind, count, amount}],          -- day = Asia/Manila date
--   flaggedOpen: int }
-- discount.applied is split by `statutory` (Senior/PWD) so no reader counts a
-- legal discount as money that didn't stay. flaggedOpen is 0 without the full view.
create or replace function public.get_store_activity_summary(
  p_tenant_id uuid,
  p_since timestamptz,
  p_until timestamptz,
  p_outlet_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
  v_until timestamptz := coalesce(p_until, now());
  v_result jsonb;
begin
  select * into s from public.store_activity_caller_scope(p_tenant_id);
  if p_since is null or p_since >= v_until then
    raise exception 'A window (p_since < p_until) is required' using errcode = '22023';
  end if;
  if v_until - p_since > interval '93 days' then
    raise exception 'The window may be at most 93 days' using errcode = '22023';
  end if;

  with visible as (
    select a.kind, a.actor_user_id, a.actor_name, a.amount, a.quantity, a.occurred_at, a.flags, a.reviewed_at,
           (a.kind = 'discount.applied' and coalesce(a.summary ->> 'statutory', 'false') = 'true') as statutory
    from public.store_activity a
    where a.tenant_id = p_tenant_id
      and a.occurred_at >= p_since and a.occurred_at < v_until
      and (p_outlet_id is null or a.outlet_id = p_outlet_id)
      and public.store_activity_row_visible(a.category, a.actor_user_id, a.outlet_id, s.o_uid, s.o_owner, s.o_full, s.o_branch)
  )
  select jsonb_build_object(
    'byKind', coalesce((
      select jsonb_agg(jsonb_build_object('kind', k.kind, 'statutory', k.statutory, 'count', k.n,
               'amount', k.amount, 'quantity', k.quantity) order by k.kind, k.statutory)
      from (select v.kind, v.statutory, count(*) n, sum(v.amount) amount, sum(v.quantity) quantity
            from visible v group by v.kind, v.statutory) k), '[]'::jsonb),
    'byActor', coalesce((
      select jsonb_agg(jsonb_build_object('actorUserId', b.actor_user_id, 'actorName', b.actor_name,
               'kind', b.kind, 'count', b.n, 'amount', b.amount) order by b.actor_name nulls last, b.kind)
      from (select v.actor_user_id, max(v.actor_name) actor_name, v.kind, count(*) n, sum(v.amount) amount
            from visible v group by v.actor_user_id, v.kind) b), '[]'::jsonb),
    'byDay', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'kind', d.kind, 'count', d.n, 'amount', d.amount)
               order by d.day, d.kind)
      from (select (v.occurred_at at time zone 'Asia/Manila')::date as day, v.kind, count(*) n, sum(v.amount) amount
            from visible v group by 1, 2) d), '[]'::jsonb),
    'flaggedOpen', case when s.o_full then
      (select count(*) from visible v where v.flags <> '{}'::text[] and v.reviewed_at is null)::integer
      else 0 end
  ) into v_result;
  return v_result;
end;
$$;

-- ============================================
-- mark_store_activity_reviewed
-- ============================================
-- Needs the full view (owner / activity_view / approve_requests) AND reach to the
-- row's branch; 'team' rows are owner-only. Only reviewed_* change, once —
-- a second call returns the first review's time.
create or replace function public.mark_store_activity_reviewed(p_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  s record;
  v_at timestamptz;
begin
  select a.id, a.tenant_id, a.category, a.outlet_id, a.reviewed_at
    into v_row from public.store_activity a where a.id = p_id;
  if v_row.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  select * into s from public.store_activity_caller_scope(v_row.tenant_id);
  if not s.o_full
     or (v_row.category = 'team' and not s.o_owner)
     or (s.o_branch is not null and v_row.outlet_id is not null and v_row.outlet_id <> s.o_branch) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_row.reviewed_at is not null then
    return v_row.reviewed_at;
  end if;

  perform set_config('app.store_activity_review', 'on', true);
  update public.store_activity a
     set reviewed_by = s.o_uid,
         reviewed_by_name = coalesce(public.store_activity_actor_name(s.o_uid), 'Owner'),
         reviewed_at = now()
   where a.id = p_id and a.reviewed_at is null
  returning a.reviewed_at into v_at;
  perform set_config('app.store_activity_review', 'off', true);

  if v_at is null then
    -- Lost a race with another reviewer: report theirs.
    select a.reviewed_at into v_at from public.store_activity a where a.id = p_id;
  end if;
  return v_at;
end;
$$;

-- ============================================
-- Grants
-- ============================================
revoke all on function public.store_activity_caller_scope(uuid) from public, anon, authenticated;
revoke all on function public.get_store_activity(uuid, integer, timestamptz, uuid, timestamptz, timestamptz, text[], uuid, uuid, boolean, boolean, text, text, text) from public, anon;
revoke all on function public.get_store_activity_summary(uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.mark_store_activity_reviewed(uuid) from public, anon;
grant execute on function public.get_store_activity(uuid, integer, timestamptz, uuid, timestamptz, timestamptz, text[], uuid, uuid, boolean, boolean, text, text, text) to authenticated;
grant execute on function public.get_store_activity_summary(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.mark_store_activity_reviewed(uuid) to authenticated;

-- ============================================
-- Rollback
-- ============================================
-- drop function if exists public.mark_store_activity_reviewed(uuid);
-- drop function if exists public.get_store_activity_summary(uuid, timestamptz, timestamptz, uuid);
-- drop function if exists public.get_store_activity(uuid, integer, timestamptz, uuid, timestamptz, timestamptz, text[], uuid, uuid, boolean, boolean, text, text, text);
-- drop function if exists public.store_activity_row_visible(text, uuid, uuid, uuid, boolean, boolean, uuid);
-- drop function if exists public.store_activity_caller_scope(uuid);
