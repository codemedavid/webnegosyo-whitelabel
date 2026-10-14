-- Approvals + refunds — Phase 3 of Store Activity & Approvals (platform stores)
--
-- A cashier who cannot refund, cancel a paid order, give a big discount or
-- write off expensive stock ASKS; an owner or a holder of approve_requests
-- answers; the money moves in ONE transaction on the database, attributed to
-- the cashier whose drawer it leaves, with the approver's name beside it.
-- Contract: docs/plans/store-activity/contract.md ("Approvals"); copy and
-- reason codes: docs/plans/store-activity/design-spec.md §3.6–3.12, §4.
--
-- Requires 20261012140000 (security floor) and 20261012150000..152000
-- (store_activity) to be applied first.
--
-- Shape decisions:
-- * Orders are referenced by TEXT id with NO foreign key (approval_requests.
--   external_order_id, order_refunds.order_id), so the records survive the
--   order deletion flow (20260924120000), like store_activity.subject_ref.
-- * NOTHING here is written by a client. The three tables have no
--   INSERT/UPDATE/DELETE grant for anon, authenticated OR service_role: every
--   write goes through the SECURITY DEFINER functions below (owned by the
--   migration role), and those functions are executable by service_role only.
--   The web routes (src/app/api/approvals/**) are the single door.
-- * SELECT: approval_requests is readable by the requester and by approvers
--   who reach the branch (owner / approve_requests). That lets the app follow
--   a request through Realtime instead of polling, without widening anything
--   the routes do not already show those people. order_refunds is readable
--   like order_payments (anyone who may see the order). approval_rules is
--   readable by every account of the store (the request sheet needs the caps
--   to say "Refund now" vs "Send for approval"). Order snapshots carry no
--   customer data (no name, phone, address) by construction.
-- * State changes are guarded by a trigger: a row changes only while one of
--   these functions has set the transaction-local GUC app.approvals_writer,
--   only along the state machine, and never in its identity columns.
-- * Business refusals are RETURNED as {ok:false, code, message}, not raised:
--   a failed execution must leave a 'failed' row behind, which a raise would
--   roll back. The money part runs in a sub-transaction so an unexpected
--   error rolls back the money and still records the failure.
--
-- Rollback at end.

set lock_timeout = '3s';

-- ============================================
-- 1. Device capability: which Android channels a token registered
-- ============================================
-- A push to a channel the device never created is dropped silently (Expo
-- docs). The app reports its channels; the server sends channelId
-- 'approvals' only to tokens that list it and omits channelId otherwise.
alter table public.platform_device_tokens
  add column if not exists channels text[] not null default '{}'::text[];
comment on column public.platform_device_tokens.channels is
  'Android notification channels this install created (e.g. {approvals}). Empty = only the default channel. Written by the app on registration.';

-- ============================================
-- 2. approval_rules (one row per store; defaults when absent)
-- ============================================
create table if not exists public.approval_rules (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  direct_refund_cap numeric(12, 2) not null default 300,
  manager_approve_cap numeric(12, 2) not null default 1000,
  staff_refund_window text not null default 'same_day',
  discount_pct_needs_approval numeric(5, 2) not null default 20,
  writeoff_cost_needs_approval numeric(12, 2) not null default 500,
  expiry_minutes integer not null default 30,
  max_pending_per_staff integer not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  constraint approval_rules_caps_ck check (
    direct_refund_cap >= 0 and direct_refund_cap <= 1000000
    and manager_approve_cap >= 0 and manager_approve_cap <= 1000000
    and writeoff_cost_needs_approval >= 0 and writeoff_cost_needs_approval <= 1000000
  ),
  constraint approval_rules_window_ck check (staff_refund_window in ('same_day', 'any')),
  constraint approval_rules_pct_ck check (discount_pct_needs_approval >= 0 and discount_pct_needs_approval <= 100),
  constraint approval_rules_expiry_ck check (expiry_minutes between 5 and 240),
  constraint approval_rules_pending_ck check (max_pending_per_staff between 1 and 20)
);

comment on table public.approval_rules is
  'Per-store approval limits (Phase 3). Absent row = defaults (approval_rules_effective). Written only by set_approval_rules.';

alter table public.approval_rules enable row level security;
revoke all on public.approval_rules from public, anon, authenticated, service_role;
grant select on public.approval_rules to authenticated, service_role;

drop policy if exists approval_rules_select_members on public.approval_rules;
create policy approval_rules_select_members on public.approval_rules
  for select to authenticated
  using (exists (
    select 1 from public.app_users au
     where au.user_id = (select auth.uid())
       and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = approval_rules.tenant_id))
  ));

-- ============================================
-- 3. approval_requests
-- ============================================
create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- No FK: a removed branch must not need an UPDATE of a guarded row.
  outlet_id uuid,
  kind text not null,
  status text not null,
  -- Acted directly within the requester's own limit: no one was asked.
  is_direct boolean not null default false,
  backend text not null default 'platform',
  external_order_id text,
  order_number text,
  payload jsonb not null default '{}'::jsonb,
  amount numeric(12, 2) not null,
  approved_amount numeric(12, 2),
  reason_code text not null,
  note text,
  order_snapshot jsonb,
  requested_by uuid not null,
  requested_by_name text,
  requester_shift_id uuid,
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_reason_code text,
  decision_note text,
  expires_at timestamptz not null,
  executed_at timestamptz,
  result jsonb,
  error text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint approval_requests_kind_ck check (kind in ('refund', 'cancel_paid', 'discount', 'stock_writeoff')),
  constraint approval_requests_status_ck check (status in (
    'pending', 'approved', 'executing', 'executed', 'failed', 'declined', 'expired', 'withdrawn'
  )),
  constraint approval_requests_backend_ck check (backend in ('platform', 'convex', 'supabase')),
  constraint approval_requests_amount_ck check (amount >= 0),
  constraint approval_requests_approved_amount_ck check (approved_amount is null or (approved_amount > 0 and approved_amount <= amount)),
  constraint approval_requests_order_ck check (kind = 'stock_writeoff' or external_order_id is not null),
  constraint approval_requests_payload_ck check (jsonb_typeof(payload) = 'object'),
  constraint approval_requests_reason_len_ck check (length(reason_code) between 1 and 64),
  constraint approval_requests_note_len_ck check (note is null or length(note) <= 500),
  constraint approval_requests_decision_note_len_ck check (decision_note is null or length(decision_note) <= 500),
  constraint approval_requests_idem_len_ck check (length(idempotency_key) between 8 and 128),
  -- Nobody decided a pending / expired / withdrawn request; somebody decided every other.
  constraint approval_requests_decided_ck check ((decided_by is null) = (status in ('pending', 'expired', 'withdrawn'))),
  constraint approval_requests_idempotency_uq unique (tenant_id, requested_by, idempotency_key)
);

comment on table public.approval_requests is
  'Refund / cancel-paid / discount / write-off requests and their decisions (Phase 3). Written only by the approvals functions; guarded state machine.';
comment on column public.approval_requests.order_snapshot is
  'What the requester saw: totals, revision, lines, tenders. NO customer data.';

-- One open request per order and kind: a second tap, a second phone or a
-- second cashier gets the first request back instead of a duplicate.
create unique index if not exists approval_requests_one_open_uq
  on public.approval_requests (tenant_id, backend, external_order_id, kind)
  where status in ('pending', 'approved', 'executing') and external_order_id is not null;
create index if not exists approval_requests_tenant_status_idx
  on public.approval_requests (tenant_id, status, created_at desc);
create index if not exists approval_requests_requester_idx
  on public.approval_requests (tenant_id, requested_by, created_at desc);
create index if not exists approval_requests_expiry_idx
  on public.approval_requests (expires_at) where status = 'pending';
create index if not exists approval_requests_decided_idx
  on public.approval_requests (tenant_id, decided_at desc) where decided_at is not null;

alter table public.approval_requests enable row level security;
revoke all on public.approval_requests from public, anon, authenticated, service_role;
grant select on public.approval_requests to authenticated, service_role;

drop policy if exists approval_requests_select_involved on public.approval_requests;
create policy approval_requests_select_involved on public.approval_requests
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or (
      public.app_user_has_permission(tenant_id, 'approve_requests')
      and public.app_user_may_reach_branch(tenant_id, outlet_id)
    )
  );

-- Realtime for the requester's live card (falls back to polling if absent).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'approval_requests'
     ) then
    execute 'alter publication supabase_realtime add table public.approval_requests';
  end if;
end;
$$;

-- ============================================
-- 4. order_refunds (+ per-store R-number counter)
-- ============================================
create table if not exists public.order_refund_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  last_number integer not null default 0
);
alter table public.order_refund_counters enable row level security;
revoke all on public.order_refund_counters from public, anon, authenticated, service_role;

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outlet_id uuid,
  order_id text not null,
  refund_number integer not null,
  scope text not null,
  lines jsonb not null default '[]'::jsonb,
  amount numeric(12, 2) not null,
  method text,
  payment_row_ids uuid[] not null default '{}'::uuid[],
  -- The bookkeeping charge written for an order paid before the ledger
  -- existed (see execute_refund), so the refund has something to net against.
  opening_payment_id uuid,
  revision_id uuid,
  approval_id uuid not null,
  reason_code text,
  reason text,
  note text,
  restock boolean not null default false,
  cancelled_order boolean not null default false,
  issued_by uuid not null,
  issued_by_name text,
  approved_by uuid,
  approved_by_name text,
  created_at timestamptz not null default now(),
  constraint order_refunds_number_uq unique (tenant_id, refund_number),
  constraint order_refunds_approval_uq unique (approval_id),
  constraint order_refunds_scope_ck check (scope in ('items', 'amount', 'whole')),
  constraint order_refunds_amount_ck check (amount > 0),
  constraint order_refunds_lines_ck check (jsonb_typeof(lines) = 'array')
);

comment on table public.order_refunds is
  'One row per refund (R-0001 per store). Money is in order_payments kind=refund (payment_row_ids). Append-only; written only by execute_refund.';

create index if not exists order_refunds_order_idx on public.order_refunds (tenant_id, order_id);
create index if not exists order_refunds_tenant_time_idx on public.order_refunds (tenant_id, created_at desc);
-- The activity trigger wrappers ask "is this payment / revision part of a refund?"
create index if not exists order_refunds_payment_rows_gin on public.order_refunds using gin (payment_row_ids);
create index if not exists order_refunds_revision_idx on public.order_refunds (revision_id) where revision_id is not null;
create index if not exists order_refunds_opening_idx on public.order_refunds (opening_payment_id) where opening_payment_id is not null;

alter table public.order_refunds enable row level security;
revoke all on public.order_refunds from public, anon, authenticated, service_role;
grant select on public.order_refunds to authenticated, service_role;

drop policy if exists order_refunds_select_order_viewers on public.order_refunds;
create policy order_refunds_select_order_viewers on public.order_refunds
  for select to authenticated
  using (public.app_user_may_see_order(tenant_id, outlet_id));

-- ============================================
-- 5. Guards
-- ============================================
create or replace function public.approval_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('pending', 'approved'), ('pending', 'declined'), ('pending', 'withdrawn'), ('pending', 'expired'),
    ('approved', 'executing'), ('executing', 'executed'), ('executing', 'failed')
  )
$$;

create or replace function public.approval_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_identity constant text[] := array[
    'id', 'tenant_id', 'outlet_id', 'kind', 'is_direct', 'backend', 'external_order_id', 'order_number',
    'payload', 'amount', 'reason_code', 'note', 'order_snapshot', 'requested_by', 'requested_by_name',
    'requester_shift_id', 'expires_at', 'idempotency_key', 'created_at'
  ];
  v_col text;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
      return old;
    end if;
    raise exception 'approval requests are never deleted' using errcode = '42501';
  end if;

  if coalesce(current_setting('app.approvals_writer', true), '') <> 'on' then
    raise exception 'approval requests change only through the approvals functions' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'approved') then
      raise exception 'a request starts pending (or approved, when acted on directly)' using errcode = '23514';
    end if;
    return new;
  end if;

  foreach v_col in array v_identity loop
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception 'approval request column % never changes', v_col using errcode = '42501';
    end if;
  end loop;

  -- Once decided, the decision itself is history.
  if old.status <> 'pending' then
    foreach v_col in array array['decided_by', 'decided_by_name', 'decided_at', 'decision_reason_code',
                                 'decision_note', 'approved_amount'] loop
      if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
        raise exception 'approval request column % never changes after the decision', v_col using errcode = '42501';
      end if;
    end loop;
  end if;

  if new.status is distinct from old.status then
    if not public.approval_transition_allowed(old.status, new.status) then
      raise exception 'approval request cannot move from % to %', old.status, new.status using errcode = '23514';
    end if;
    return new;
  end if;

  -- Same status: only the post-commit side-effect report on a finished row.
  if old.status in ('executed', 'failed')
     and (to_jsonb(new) - array['result', 'updated_at']) = (to_jsonb(old) - array['result', 'updated_at']) then
    return new;
  end if;
  raise exception 'approval request is not editable in status %', old.status using errcode = '42501';
end;
$$;

revoke all on function public.approval_requests_guard() from public, anon, authenticated;

drop trigger if exists approval_requests_guard on public.approval_requests;
create trigger approval_requests_guard
  before insert or update or delete on public.approval_requests
  for each row execute function public.approval_requests_guard();

-- order_refunds / approval_rules history: append-only except the tenant cascade.
create or replace function public.approvals_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  raise exception '% rows are append-only', tg_table_name using errcode = '42501';
end;
$$;

revoke all on function public.approvals_append_only() from public, anon, authenticated;

drop trigger if exists order_refunds_append_only on public.order_refunds;
create trigger order_refunds_append_only
  before update or delete on public.order_refunds
  for each row execute function public.approvals_append_only();

-- ============================================
-- 6. Who may do what (explicit user: these run as service role, auth.uid() is NULL)
-- ============================================
-- Mirrors app_user_has_permission (20261012140000) for a NAMED user.
create or replace function public.approval_user_can(p_tenant_id uuid, p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users au
     where au.user_id = p_user_id
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin' and au.tenant_id = p_tenant_id
           and (
             au.is_owner is true
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests']))
             or p_permission = any (au.permissions)
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
           )
         )
       )
  )
$$;

create or replace function public.approval_user_is_owner(p_tenant_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users au
     where au.user_id = p_user_id
       and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = p_tenant_id and au.is_owner is true))
  )
$$;

-- Mirrors app_user_may_reach_branch for a NAMED user (+ superadmin).
create or replace function public.approval_user_reaches(p_tenant_id uuid, p_user_id uuid, p_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users au
     where au.user_id = p_user_id
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin' and au.tenant_id = p_tenant_id
           and (au.outlet_id is null or coalesce(au.is_owner, false) or au.outlet_id = p_outlet_id)
         )
       )
  )
$$;

-- Effective rules: the row merged over the defaults.
create or replace function public.approval_rules_effective(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'directRefundCap', coalesce(r.direct_refund_cap, 300),
    'managerApproveCap', coalesce(r.manager_approve_cap, 1000),
    'staffRefundWindow', coalesce(r.staff_refund_window, 'same_day'),
    'discountPctNeedsApproval', coalesce(r.discount_pct_needs_approval, 20),
    'writeoffCostNeedsApproval', coalesce(r.writeoff_cost_needs_approval, 500),
    'expiryMinutes', coalesce(r.expiry_minutes, 30),
    'maxPendingPerStaff', coalesce(r.max_pending_per_staff, 3),
    'updatedAt', r.updated_at,
    'updatedByName', r.updated_by_name
  )
  from (select 1) one
  left join public.approval_rules r on r.tenant_id = p_tenant_id
$$;

-- The most an approver may say yes to. NULL = no limit (owner / superadmin);
-- -1 = may not approve at all. TS twin: approverCapCentavos (src/lib/approvals/rules.ts).
create or replace function public.approval_approver_cap(p_tenant_id uuid, p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.approval_user_is_owner(p_tenant_id, p_user_id) then null
    when public.approval_user_can(p_tenant_id, p_user_id, 'approve_requests')
      then (public.approval_rules_effective(p_tenant_id) ->> 'managerApproveCap')::numeric
    else -1
  end
$$;

-- Whether p_user may act on this request WITHOUT asking. The TS twin
-- (decideRoute, src/lib/approvals/rules.ts) decides the UX; this is the
-- database's own check, so a route bug cannot hand out direct refunds.
create or replace function public.approval_direct_allowed(
  p_tenant_id uuid, p_user_id uuid, p_kind text, p_amount numeric, p_order_created_at timestamptz,
  p_discount_pct numeric default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb := public.approval_rules_effective(p_tenant_id);
  v_cap numeric := public.approval_approver_cap(p_tenant_id, p_user_id);
  v_same_day boolean;
begin
  if public.approval_user_is_owner(p_tenant_id, p_user_id) then
    return true;
  end if;
  -- An approver may do directly what they could approve for someone else.
  if v_cap is not null and v_cap >= 0 and p_amount <= v_cap then
    return true;
  end if;
  if p_kind in ('refund', 'cancel_paid') then
    if not public.approval_user_can(p_tenant_id, p_user_id, 'order_refund') then
      return false;
    end if;
    if p_kind = 'cancel_paid' and not public.approval_user_can(p_tenant_id, p_user_id, 'orders') then
      return false;
    end if;
    v_same_day := p_order_created_at is not null
      and public.store_activity_manila_day_start(p_order_created_at) = public.store_activity_manila_day_start(now());
    return p_amount <= (v_rules ->> 'directRefundCap')::numeric
      and ((v_rules ->> 'staffRefundWindow') = 'any' or v_same_day);
  elsif p_kind = 'discount' then
    return p_discount_pct is not null
      and p_discount_pct <= (v_rules ->> 'discountPctNeedsApproval')::numeric
      and (public.approval_user_can(p_tenant_id, p_user_id, 'pos') or public.approval_user_can(p_tenant_id, p_user_id, 'orders'));
  elsif p_kind = 'stock_writeoff' then
    return p_amount <= (v_rules ->> 'writeoffCostNeedsApproval')::numeric
      and public.approval_user_can(p_tenant_id, p_user_id, 'menu');
  end if;
  return false;
end;
$$;

-- May p_user ask at all? (Anyone who works the register or the orders.)
create or replace function public.approval_may_request(p_tenant_id uuid, p_user_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.approval_user_can(p_tenant_id, p_user_id, 'orders')
      or public.approval_user_can(p_tenant_id, p_user_id, 'pos')
      or (p_kind = 'stock_writeoff' and public.approval_user_can(p_tenant_id, p_user_id, 'menu'))
$$;

-- ============================================
-- 7. Activity writer that can name the approver
-- ============================================
-- store_activity_record (Phase 1) has no approved_by parameter, and adding one
-- would overload it (ambiguous named calls). Same rules as that writer:
-- category/routine derived, names snapshotted, after_hours for money kinds,
-- replay-safe (event_key), NEVER raises.
create or replace function public.approvals_activity(
  p_tenant_id uuid,
  p_kind text,
  p_event_key text,
  p_source_table text,
  p_source_id text,
  p_outlet_id uuid default null,
  p_actor_user_id uuid default null,
  p_approved_by uuid default null,
  p_amount numeric default null,
  p_reason text default null,
  p_note text default null,
  p_subject_type text default null,
  p_subject_ref text default null,
  p_order_number text default null,
  p_external_order_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_summary jsonb default '{}'::jsonb,
  p_flags text[] default '{}'::text[],
  -- true: a failure RAISES (execute_refund's refund.issued row must not be
  -- lost while the money commits); false: warn and carry on, like
  -- store_activity_record.
  p_strict boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flags text[] := coalesce(p_flags, '{}'::text[]);
  v_summary jsonb := coalesce(p_summary, '{}'::jsonb);
begin
  -- Free text typed by staff ("refund to 0917 123 4567") is scrubbed exactly
  -- as store_activity_write does it.
  if v_summary ? 'title' then
    v_summary := jsonb_set(v_summary, '{title}', to_jsonb(public.store_activity_scrub(v_summary ->> 'title')));
  end if;
  if p_kind in ('refund.issued', 'order.cancelled', 'order.edited', 'discount.applied', 'stock.wasted')
     and not ('after_hours' = any (v_flags))
     and public.store_activity_is_after_hours(p_tenant_id, p_outlet_id, now()) then
    v_flags := v_flags || 'after_hours'::text;
  end if;

  insert into public.store_activity (
    tenant_id, outlet_id, occurred_at, category, kind, is_routine,
    actor_user_id, actor_name, approved_by, approved_by_name, amount, reason, note,
    subject_type, subject_ref, order_number, backend, external_order_id,
    before, after, summary, flags, source_table, source_id, event_key
  ) values (
    p_tenant_id, p_outlet_id, now(), public.store_activity_category_of(p_kind), p_kind,
    public.store_activity_is_routine(p_kind),
    p_actor_user_id, public.store_activity_actor_name(p_actor_user_id),
    p_approved_by, public.store_activity_actor_name(p_approved_by),
    round(p_amount, 2),
    left(nullif(btrim(public.store_activity_scrub(p_reason)), ''), 500),
    left(nullif(btrim(public.store_activity_scrub(p_note)), ''), 1000),
    p_subject_type, p_subject_ref, p_order_number,
    case when p_external_order_id is not null then 'platform' end, p_external_order_id,
    p_before, p_after, v_summary,
    array(select distinct f from unnest(v_flags) f order by f),
    p_source_table, p_source_id, p_event_key
  )
  on conflict (event_key) do nothing;
exception when others then
  if p_strict then
    raise;
  end if;
  raise warning 'approvals_activity(%, %) failed: % (%)', p_kind, p_event_key, sqlerrm, sqlstate;
end;
$$;

-- One approval.* row for a request. Event key = request + status, so a
-- replayed transition never double-reports.
create or replace function public.approvals_activity_for(p_req public.approval_requests, p_kind text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := case p_req.kind
    when 'refund' then 'Refund'
    when 'cancel_paid' then 'Cancel paid order'
    when 'discount' then 'Discount'
    else 'Write-off' end;
  v_verb text := case p_kind
    when 'approval.requested' then 'requested'
    when 'approval.approved' then 'approved'
    when 'approval.declined' then 'declined'
    when 'approval.expired' then 'expired'
    when 'approval.withdrawn' then 'withdrawn'
    when 'approval.executed' then 'done'
    else 'failed' end;
begin
  perform public.approvals_activity(
    p_tenant_id => p_req.tenant_id,
    p_kind => p_kind,
    p_event_key => 'approval_requests:' || p_req.id || ':' || p_kind,
    p_source_table => 'approval_requests',
    p_source_id => p_req.id::text,
    p_outlet_id => p_req.outlet_id,
    p_actor_user_id => p_actor,
    p_approved_by => case when p_kind in ('approval.approved', 'approval.executed') then p_req.decided_by end,
    p_amount => case when p_req.kind = 'stock_writeoff' then null else -coalesce(p_req.approved_amount, p_req.amount) end,
    p_reason => coalesce(p_req.decision_reason_code, p_req.reason_code),
    p_note => case when p_kind = 'approval.declined' then p_req.decision_note
                   when p_kind = 'approval.failed' then p_req.error
                   else p_req.note end,
    p_subject_type => 'approval',
    p_subject_ref => p_req.id::text,
    p_order_number => p_req.order_number,
    p_external_order_id => p_req.external_order_id,
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', v_label || ' ' || coalesce(p_req.order_number || ' ', '') || v_verb,
      'approvalKind', p_req.kind,
      'requestedByName', p_req.requested_by_name,
      'requestedBy', p_req.requested_by,
      'decidedByName', p_req.decided_by_name,
      'requestedAmount', p_req.amount,
      'approvedAmount', p_req.approved_amount,
      'refundNumber', p_req.result ->> 'refundLabel')));
end;
$$;

-- ============================================
-- 8. Order money helpers
-- ============================================
-- The order's money, per tender. "Implicit" = paid by status, but no ledger
-- rows (most POS sales: the register stored the tender in customer_data only).
create or replace function public.approval_order_ledger(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_tenders jsonb;
  v_net numeric;
  v_rows integer;
begin
  select o.total, o.payment_status, o.payment_method_id, o.payment_method_name, o.customer_data
    into v_order
    from public.orders o where o.id = p_order_id;
  if not found then
    return null;
  end if;

  select count(*) into v_rows from public.order_payments p where p.order_id = p_order_id;

  if v_rows = 0 then
    if coalesce(v_order.payment_status, '') in ('paid', 'verified') and v_order.total > 0 then
      return jsonb_build_object(
        'implicit', true, 'net', v_order.total, 'charged', v_order.total, 'refunded', 0,
        'tenders', jsonb_build_array(jsonb_build_object(
          'methodId', v_order.payment_method_id,
          -- The register keeps cash tendered in customer_data.pos; a nameless
          -- sale with cash tendered was a cash sale (so the drawer rule applies).
          'methodName', coalesce(v_order.payment_method_name,
                                 case when (v_order.customer_data -> 'pos' ->> 'cashTendered') is not null then 'Cash' end),
          'net', v_order.total, 'lastChargeAt', null)));
    end if;
    return jsonb_build_object('implicit', false, 'net', 0, 'charged', 0, 'refunded', 0, 'tenders', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'methodId', t.method_id, 'methodName', nullif(t.method_name, ''),
           'net', t.charged - t.refunded, 'lastChargeAt', t.last_charge_at)
           order by t.last_charge_at desc nulls last), '[]'::jsonb),
         coalesce(sum(t.charged - t.refunded), 0)
    into v_tenders, v_net
    from (
      select coalesce(p.payment_method_name, '') as method_name,
             (array_agg(p.payment_method_id order by p.created_at desc) filter (where p.kind = 'charge'))[1] as method_id,
             coalesce(sum(p.amount) filter (where p.kind = 'charge'), 0) as charged,
             coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0) as refunded,
             max(p.created_at) filter (where p.kind = 'charge') as last_charge_at
        from public.order_payments p
       where p.order_id = p_order_id
       group by 1
    ) t;

  return jsonb_build_object(
    'implicit', false, 'net', v_net,
    'charged', (select coalesce(sum(amount), 0) from public.order_payments where order_id = p_order_id and kind = 'charge'),
    'refunded', (select coalesce(sum(amount), 0) from public.order_payments where order_id = p_order_id and kind = 'refund'),
    'tenders', v_tenders);
end;
$$;

-- Split p_amount across the tenders that still hold money, newest charge
-- first. Returns [{methodId, methodName, amount, isCash}]; [] when it cannot cover.
create or replace function public.approval_refund_allocation(p_ledger jsonb, p_amount numeric)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_left numeric := round(p_amount, 2);
  v_take numeric;
  v_tender jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if p_ledger is null or v_left <= 0 then
    return '[]'::jsonb;
  end if;
  for v_tender in select value from jsonb_array_elements(coalesce(p_ledger -> 'tenders', '[]'::jsonb)) loop
    exit when v_left <= 0;
    v_take := least(v_left, round(coalesce((v_tender ->> 'net')::numeric, 0), 2));
    if v_take > 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'methodId', v_tender -> 'methodId',
        'methodName', v_tender ->> 'methodName',
        'amount', v_take,
        'isCash', coalesce(v_tender ->> 'methodName', '') ~* '\mcash\M'));
      v_left := v_left - v_take;
    end if;
  end loop;
  if v_left > 0 then
    return '[]'::jsonb;
  end if;
  return v_out;
end;
$$;

-- The order's lines in the revision snapshot format (camelCase, like
-- webnegosyo-app/lib/backends/supabase-adapter.ts reviseOrder).
create or replace function public.approval_order_items_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'menuItemId', coalesce(i.menu_item_id::text, ''),
           'menuItemName', i.menu_item_name,
           'quantity', i.quantity,
           'price', i.price,
           'subtotal', i.subtotal,
           'specialInstructions', i.special_instructions,
           'variationSelections', i.variation_selections,
           'variation', i.variation,
           'isUpsellItem', case when i.is_upsell_item then true end,
           'isBundleItem', case when i.is_bundle_item then true end,
           'bundleId', i.bundle_id,
           'bundleName', i.bundle_name,
           'slotName', i.slot_name)) order by i.menu_item_name, i.id), '[]'::jsonb)
    from public.order_items i
   where i.order_id = p_order_id
$$;

-- What a line is worth to the customer: its subtotal net of its own discount.
create or replace function public.approval_line_value(p_subtotal numeric, p_discount numeric, p_quantity integer, p_take integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_quantity <= 0 or p_take <= 0 then 0
    when p_take >= p_quantity then round(greatest(p_subtotal - coalesce(p_discount, 0), 0), 2)
    else round(greatest(p_subtotal - coalesce(p_discount, 0), 0) * p_take / p_quantity, 2)
  end
$$;

-- The PII-free snapshot an approver decides on and execution re-checks.
create or replace function public.approval_order_snapshot(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'orderId', o.id,
    'orderNumber', public.store_activity_order_label(o.daily_number, o.id::text),
    'status', o.status,
    'paymentStatus', o.payment_status,
    'paymentMethodName', o.payment_method_name,
    'source', o.source,
    'orderType', o.order_type,
    'total', o.total,
    'revisionNumber', o.revision_number,
    'createdAt', o.created_at,
    'outletId', o.outlet_id,
    'ledger', public.approval_order_ledger(o.id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'name', i.menu_item_name, 'menuItemId', i.menu_item_id,
               'quantity', i.quantity,
               'lineTotal', public.approval_line_value(i.subtotal, i.discount_amount, i.quantity, i.quantity))
               order by i.menu_item_name, i.id), '[]'::jsonb)
        from public.order_items i where i.order_id = o.id))
  from public.orders o
  where o.id = p_order_id
$$;

-- The requester's open drawer at the order's branch (where a cash refund comes from).
create or replace function public.approval_open_shift(p_tenant_id uuid, p_user_id uuid, p_outlet_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.staff_shifts s
   where s.tenant_id = p_tenant_id
     and s.staff_user_id = p_user_id
     and s.status = 'open'
     and s.outlet_id is not distinct from p_outlet_id
   order by s.opened_at desc
   limit 1
$$;

create or replace function public.approval_refusal(p_code text, p_message text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ok', false, 'code', p_code, 'message', p_message)
$$;

-- ============================================
-- 9. Quote: what a request would be (amount, snapshot) — no writes
-- ============================================
-- payload by kind:
--   refund:         {scope:'items', lines:[{orderItemId, quantity}]} | {scope:'amount', amount} | {scope:'whole'}; restock?
--   cancel_paid:    {restock?}
--   discount:       {amountOff, pct}
--   stock_writeoff: {inventoryItemId, quantity, outletId?}
create or replace function public.approval_quote(
  p_tenant_id uuid, p_user_id uuid, p_kind text, p_external_order_id text, p_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_ledger jsonb;
  v_net numeric;
  v_amount numeric;
  v_scope text;
  v_line jsonb;
  v_item public.order_items%rowtype;
  v_qty integer;
  v_seen uuid[] := '{}'::uuid[];
  v_remaining integer;
  v_alloc jsonb;
  v_cash boolean;
  v_shift uuid;
  v_inv record;
  v_wo_qty numeric;
  v_outlet uuid;
begin
  if p_kind = 'stock_writeoff' then
    begin
      v_wo_qty := (p_payload ->> 'quantity')::numeric;
    exception when others then
      return public.approval_refusal('invalid_payload', 'Enter how much to write off.');
    end;
    if v_wo_qty is null or v_wo_qty <= 0 or v_wo_qty > 100000 then
      return public.approval_refusal('invalid_payload', 'Enter how much to write off.');
    end if;
    select i.id, i.name, i.unit_cost, coalesce(nullif(u.abbreviation, ''), u.name) as unit
      into v_inv
      from public.inventory_items i
      left join public.inventory_units u on u.id = i.stock_unit_id
     where i.id = public.store_activity_try_uuid(p_payload ->> 'inventoryItemId') and i.tenant_id = p_tenant_id;
    if not found then
      return public.approval_refusal('not_found', 'That ingredient is not in this store.');
    end if;
    v_outlet := public.store_activity_try_uuid(p_payload ->> 'outletId');
    if v_outlet is not null and not exists (select 1 from public.outlets o where o.id = v_outlet and o.tenant_id = p_tenant_id) then
      return public.approval_refusal('not_found', 'That branch is not in this store.');
    end if;
    return jsonb_build_object(
      'ok', true,
      'amount', round(v_wo_qty * coalesce(v_inv.unit_cost, 0), 2),
      'outletId', v_outlet,
      'orderNumber', null,
      'orderCreatedAt', null,
      'snapshot', jsonb_build_object('ingredientName', v_inv.name, 'unit', v_inv.unit,
                                     'unitCost', v_inv.unit_cost, 'quantity', v_wo_qty),
      'allocation', '[]'::jsonb, 'cashInvolved', false, 'requesterShiftId', null);
  end if;

  select * into v_order from public.orders o
   where o.id = public.store_activity_try_uuid(p_external_order_id) and o.tenant_id = p_tenant_id;
  if not found then
    return public.approval_refusal('order_not_found', 'That order is not in this store.');
  end if;

  v_ledger := public.approval_order_ledger(v_order.id);
  v_net := coalesce((v_ledger ->> 'net')::numeric, 0);

  if p_kind = 'discount' then
    begin
      v_amount := round((p_payload ->> 'amountOff')::numeric, 2);
    exception when others then
      return public.approval_refusal('invalid_payload', 'Enter the discount.');
    end;
    if v_amount is null or v_amount <= 0 or v_amount > v_order.total then
      return public.approval_refusal('invalid_payload', 'The discount must be more than ₱0 and no more than the order total.');
    end if;
    if v_order.status = 'cancelled' then
      return public.approval_refusal('order_cancelled', 'This order was cancelled.');
    end if;
    return jsonb_build_object('ok', true, 'amount', v_amount, 'outletId', v_order.outlet_id,
      -- The percent is the database's arithmetic, never the client's claim.
      'pct', round(v_amount / nullif(v_order.total, 0) * 100, 2),
      'orderNumber', public.store_activity_order_label(v_order.daily_number, v_order.id::text),
      'orderCreatedAt', v_order.created_at, 'snapshot', public.approval_order_snapshot(v_order.id),
      'allocation', '[]'::jsonb, 'cashInvolved', false, 'requesterShiftId', null);
  end if;

  if p_kind not in ('refund', 'cancel_paid') then
    return public.approval_refusal('invalid_payload', 'Unknown request kind.');
  end if;

  v_scope := case when p_kind = 'cancel_paid' then 'whole' else coalesce(p_payload ->> 'scope', '') end;

  if v_net <= 0 then
    return public.approval_refusal('nothing_to_refund', 'Nothing was paid on this order, so there is nothing to give back.');
  end if;
  if v_scope in ('items', 'amount') and v_order.status = 'cancelled' then
    return public.approval_refusal('order_cancelled', 'This order was cancelled. Refund the whole order instead.');
  end if;

  if v_scope = 'whole' then
    v_amount := v_net;
  elsif v_scope = 'amount' then
    begin
      v_amount := round((p_payload ->> 'amount')::numeric, 2);
    exception when others then
      return public.approval_refusal('invalid_payload', 'Enter the amount to give back.');
    end;
    if v_amount is null or v_amount <= 0 then
      return public.approval_refusal('invalid_payload', 'Enter the amount to give back.');
    end if;
  elsif v_scope = 'items' then
    if jsonb_typeof(p_payload -> 'lines') <> 'array' or jsonb_array_length(p_payload -> 'lines') = 0 then
      return public.approval_refusal('invalid_lines', 'Pick the items to refund.');
    end if;
    v_amount := 0;
    for v_line in select value from jsonb_array_elements(p_payload -> 'lines') loop
      select * into v_item from public.order_items i
       where i.id = public.store_activity_try_uuid(v_line ->> 'orderItemId') and i.order_id = v_order.id;
      begin
        v_qty := (v_line ->> 'quantity')::integer;
      exception when others then
        v_qty := null;
      end;
      if v_item.id is null or v_qty is null or v_qty <= 0 or v_qty > v_item.quantity or v_item.id = any (v_seen) then
        return public.approval_refusal('invalid_lines', 'One of the items is no longer on this order. Reopen it and try again.');
      end if;
      v_seen := v_seen || v_item.id;
      v_amount := v_amount + public.approval_line_value(v_item.subtotal, v_item.discount_amount, v_item.quantity, v_qty);
    end loop;
    -- Taking every piece of every line is a whole-order refund (an order is
    -- never emptied by editing; it is cancelled).
    select coalesce(sum(i.quantity), 0) into v_remaining from public.order_items i where i.order_id = v_order.id;
    if v_remaining <= (
      select coalesce(sum((l ->> 'quantity')::integer), 0) from jsonb_array_elements(p_payload -> 'lines') l
    ) then
      return public.approval_refusal('empty_order', 'That is every item on the order. Choose "Whole order" instead.');
    end if;
    if v_amount <= 0 then
      return public.approval_refusal('invalid_lines', 'Those items were free, so there is nothing to refund.');
    end if;
  else
    return public.approval_refusal('invalid_payload', 'Choose items, an amount or the whole order.');
  end if;

  if v_amount > v_net then
    return public.approval_refusal('over_refund',
      'That is more than was paid on this order (' || public.store_activity_peso(v_net) || ' can still be refunded).');
  end if;

  v_alloc := public.approval_refund_allocation(v_ledger, v_amount);
  if jsonb_array_length(v_alloc) = 0 then
    return public.approval_refusal('over_refund', 'The payments on this order cannot cover that refund.');
  end if;
  select coalesce(bool_or((a ->> 'isCash')::boolean), false) into v_cash from jsonb_array_elements(v_alloc) a;
  v_shift := public.approval_open_shift(p_tenant_id, p_user_id, v_order.outlet_id);

  return jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'scope', v_scope,
    'outletId', v_order.outlet_id,
    'orderNumber', public.store_activity_order_label(v_order.daily_number, v_order.id::text),
    'orderCreatedAt', v_order.created_at,
    'snapshot', public.approval_order_snapshot(v_order.id),
    'allocation', v_alloc,
    'cashInvolved', v_cash,
    'requesterShiftId', v_shift);
end;
$$;

-- ============================================
-- 10. Create
-- ============================================
create or replace function public.create_approval_request(
  p_tenant_id uuid,
  p_user_id uuid,
  p_kind text,
  p_external_order_id text,
  p_payload jsonb,
  p_reason_code text,
  p_note text,
  p_idempotency_key text,
  p_direct boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.approval_requests%rowtype;
  v_quote jsonb;
  v_rules jsonb := public.approval_rules_effective(p_tenant_id);
  v_amount numeric;
  v_pending integer;
  v_req public.approval_requests%rowtype;
  v_pct numeric;
  v_payload jsonb;
begin
  -- Replay of the same tap: hand back what it made.
  select * into v_existing from public.approval_requests r
   where r.tenant_id = p_tenant_id and r.requested_by = p_user_id and r.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'request', to_jsonb(v_existing));
  end if;

  if not public.approval_may_request(p_tenant_id, p_user_id, p_kind) then
    return public.approval_refusal('forbidden', 'Your account cannot ask for this. Ask the owner to give you register access.');
  end if;
  if nullif(btrim(coalesce(p_reason_code, '')), '') is null then
    return public.approval_refusal('reason_required', 'Pick a reason first.');
  end if;
  -- Client-fixable inputs answer with a refusal, never a raised CHECK.
  if length(btrim(p_reason_code)) > 64 or length(coalesce(p_note, '')) > 500
     or length(coalesce(p_idempotency_key, '')) not between 8 and 128
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    return public.approval_refusal('invalid_payload', 'Something in that request is too long or malformed.');
  end if;
  -- Normalised once here, so execution never casts client text.
  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
         'restock', coalesce(p_payload ->> 'restock', 'false') in ('true', 't', '1'),
         'reasonLabel', left(coalesce(nullif(btrim(p_payload ->> 'reasonLabel'), ''), btrim(p_reason_code)), 200));

  v_quote := public.approval_quote(p_tenant_id, p_user_id, p_kind, p_external_order_id, coalesce(p_payload, '{}'::jsonb));
  if not coalesce((v_quote ->> 'ok')::boolean, false) then
    return v_quote;
  end if;
  v_amount := (v_quote ->> 'amount')::numeric;

  if coalesce((v_quote ->> 'cashInvolved')::boolean, false) and (v_quote ->> 'requesterShiftId') is null then
    return public.approval_refusal('no_open_shift',
      'Part of this refund is cash, and you have no open drawer at this branch. Open your shift first, so the cash comes out of your drawer.');
  end if;

  if p_kind = 'discount' then
    v_pct := (v_quote ->> 'pct')::numeric;
  end if;

  -- 3. A branch-locked account acts only on its own branch's orders / stock.
  if not public.approval_user_reaches(p_tenant_id, p_user_id, (v_quote ->> 'outletId')::uuid) then
    return public.approval_refusal('forbidden', 'That belongs to another branch.');
  end if;

  if p_direct and not public.approval_direct_allowed(
    p_tenant_id, p_user_id, p_kind, v_amount, (v_quote ->> 'orderCreatedAt')::timestamptz, v_pct
  ) then
    return public.approval_refusal('direct_not_allowed', 'This needs approval. Send it for approval instead.');
  end if;

  if not p_direct then
    select count(*) into v_pending from public.approval_requests r
     where r.tenant_id = p_tenant_id and r.requested_by = p_user_id and r.status = 'pending' and r.expires_at > now();
    if v_pending >= (v_rules ->> 'maxPendingPerStaff')::integer then
      return public.approval_refusal('too_many_pending',
        'You already have ' || v_pending || ' requests waiting. Wait for an answer or withdraw one.');
    end if;
  end if;

  perform set_config('app.approvals_writer', 'on', true);
  begin
    insert into public.approval_requests (
      tenant_id, outlet_id, kind, status, is_direct, backend, external_order_id, order_number,
      payload, amount, reason_code, note, order_snapshot, requested_by, requested_by_name,
      requester_shift_id, decided_by, decided_by_name, decided_at, expires_at, idempotency_key
    ) values (
      p_tenant_id, (v_quote ->> 'outletId')::uuid, p_kind,
      case when p_direct then 'approved' else 'pending' end, p_direct, 'platform',
      case when p_kind = 'stock_writeoff' then null else p_external_order_id end,
      v_quote ->> 'orderNumber',
      v_payload || jsonb_strip_nulls(jsonb_build_object('scope', v_quote ->> 'scope',
        'allocation', v_quote -> 'allocation', 'pct', v_quote -> 'pct')),
      v_amount, btrim(p_reason_code), nullif(btrim(coalesce(p_note, '')), ''), v_quote -> 'snapshot',
      p_user_id, public.store_activity_actor_name(p_user_id),
      (v_quote ->> 'requesterShiftId')::uuid,
      case when p_direct then p_user_id end,
      case when p_direct then public.store_activity_actor_name(p_user_id) end,
      case when p_direct then now() end,
      now() + make_interval(mins => (v_rules ->> 'expiryMinutes')::integer),
      p_idempotency_key
    )
    returning * into v_req;
  exception when unique_violation then
    -- Either this exact tap (raced) or another open request on the order.
    select * into v_existing from public.approval_requests r
     where r.tenant_id = p_tenant_id and r.requested_by = p_user_id and r.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'replayed', true, 'request', to_jsonb(v_existing));
    end if;
    select * into v_existing from public.approval_requests r
     where r.tenant_id = p_tenant_id and r.backend = 'platform' and r.external_order_id = p_external_order_id
       and r.kind = p_kind and r.status in ('pending', 'approved', 'executing')
     limit 1;
    return public.approval_refusal('already_open',
      coalesce(v_existing.requested_by_name, 'Someone') || ' already asked about this order. Wait for that answer.')
      || jsonb_build_object('requestId', v_existing.id);
  end;

  if not p_direct then
    perform public.approvals_activity_for(v_req, 'approval.requested', p_user_id);
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'request', to_jsonb(v_req));
end;
$$;

-- ============================================
-- 11. Expiry (lazy on every read/decide + a cheap sweep)
-- ============================================
create or replace function public.expire_approval_requests(p_tenant_id uuid default null, p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
  v_count integer := 0;
begin
  perform set_config('app.approvals_writer', 'on', true);
  for v_req in
    update public.approval_requests r
       set status = 'expired', updated_at = now()
     where r.id in (
       select x.id from public.approval_requests x
        where x.status = 'pending' and x.expires_at <= now()
          and (p_tenant_id is null or x.tenant_id = p_tenant_id)
        order by x.expires_at
        limit greatest(1, least(coalesce(p_limit, 500), 5000))
        for update skip locked
     )
    returning r.*
  loop
    perform public.approvals_activity_for(v_req, 'approval.expired', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ============================================
-- 12. Transition (CAS): approve / decline / withdraw
-- ============================================
create or replace function public.transition_approval(
  p_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_to text,
  p_reason_code text default null,
  p_note text default null,
  p_approved_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
  v_cap numeric;
  v_amount numeric;
  v_is_owner boolean := public.approval_user_is_owner(p_tenant_id, p_actor);
begin
  perform public.expire_approval_requests(p_tenant_id, 50);

  select * into v_req from public.approval_requests r
   where r.id = p_id and r.tenant_id = p_tenant_id
   for update;
  if not found then
    return public.approval_refusal('not_found', 'This request could not be found.');
  end if;
  -- The sweep above is bounded; the row in hand is checked itself.
  if v_req.status = 'pending' and v_req.expires_at <= now() then
    perform set_config('app.approvals_writer', 'on', true);
    update public.approval_requests set status = 'expired', updated_at = now()
     where id = v_req.id returning * into v_req;
    perform public.approvals_activity_for(v_req, 'approval.expired', null);
  end if;
  if v_req.status <> 'pending' then
    return public.approval_refusal(
      case v_req.status when 'expired' then 'expired' when 'withdrawn' then 'withdrawn' else 'not_pending' end,
      case v_req.status
        when 'expired' then 'This request expired.'
        when 'withdrawn' then coalesce(v_req.requested_by_name, 'The requester') || ' withdrew this request.'
        else 'That request was already answered by ' || coalesce(v_req.decided_by_name, 'someone') || '.'
      end) || jsonb_build_object('request', to_jsonb(v_req));
  end if;

  if p_to = 'withdrawn' then
    if p_actor <> v_req.requested_by then
      return public.approval_refusal('not_requester', 'Only the person who asked can withdraw this request.');
    end if;
    perform set_config('app.approvals_writer', 'on', true);
    update public.approval_requests set status = 'withdrawn', updated_at = now()
     where id = v_req.id returning * into v_req;
    perform public.approvals_activity_for(v_req, 'approval.withdrawn', p_actor);
    return jsonb_build_object('ok', true, 'request', to_jsonb(v_req));
  end if;

  if p_to not in ('approved', 'declined') then
    return public.approval_refusal('invalid_transition', 'Unknown decision.');
  end if;

  -- Two names on every money decision: never your own, unless you own the store.
  if p_actor = v_req.requested_by and not v_is_owner then
    return public.approval_refusal('self_approval', 'You cannot answer your own request.');
  end if;
  if not public.approval_user_reaches(p_tenant_id, p_actor, v_req.outlet_id) then
    return public.approval_refusal('not_approver', 'This request is for another branch.');
  end if;
  v_cap := public.approval_approver_cap(p_tenant_id, p_actor);
  if v_cap is not null and v_cap < 0 then
    return public.approval_refusal('not_approver', 'Your account cannot answer requests. Ask the owner for "Approve requests".');
  end if;

  if p_to = 'declined' then
    if nullif(btrim(coalesce(p_reason_code, '')), '') is null then
      return public.approval_refusal('reason_required', 'Pick a reason so they know what to do next.');
    end if;
  end if;

  v_amount := coalesce(p_approved_amount, v_req.amount);
  if p_to = 'approved' and p_approved_amount is not null then
    if v_req.kind <> 'refund' or coalesce(v_req.payload ->> 'scope', '') <> 'amount' then
      return public.approval_refusal('amount_override_not_allowed', 'Only an amount refund can be approved for less.');
    end if;
    if round(p_approved_amount, 2) <= 0 or round(p_approved_amount, 2) > v_req.amount then
      return public.approval_refusal('amount_override_too_high', 'Approve between ₱0.01 and the amount asked.');
    end if;
  end if;
  if v_cap is not null and v_amount > v_cap then
    return public.approval_refusal('over_limit',
      'Over your ' || public.store_activity_peso(v_cap) || ' limit. The owner has been asked.');
  end if;

  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests
     set status = p_to,
         decided_by = p_actor,
         decided_by_name = public.store_activity_actor_name(p_actor),
         decided_at = now(),
         decision_reason_code = nullif(btrim(coalesce(p_reason_code, '')), ''),
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         approved_amount = case when p_to = 'approved' and p_approved_amount is not null then round(p_approved_amount, 2) end,
         updated_at = now()
   where id = v_req.id and status = 'pending'
   returning * into v_req;
  if not found then
    return public.approval_refusal('not_pending', 'That request was already answered.');
  end if;

  perform public.approvals_activity_for(v_req,
    case when p_to = 'approved' then 'approval.approved' else 'approval.declined' end, p_actor);
  return jsonb_build_object('ok', true, 'request', to_jsonb(v_req));
end;
$$;

-- ============================================
-- 13. Voucher release (whole refund / cancel)
-- ============================================
-- Deleting a redemption decrements vouchers.used_count (trg_voucher_redemptions_count)
-- and the Phase 1 trigger records voucher.released.
create or replace function public.release_voucher_redemptions(p_tenant_id uuid, p_order_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.voucher_redemptions vr
   where vr.tenant_id = p_tenant_id and vr.order_id = p_order_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================
-- 14. Execution: refund / cancel_paid (everything money-side, one transaction)
-- ============================================
create or replace function public.approval_finish(p_req public.approval_requests, p_ok boolean, p_result jsonb, p_error text)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
begin
  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests
     set status = case when p_ok then 'executed' else 'failed' end,
         executed_at = case when p_ok then now() end,
         result = p_result,
         error = p_error,
         updated_at = now()
   where id = p_req.id and status = 'executing'
   returning * into v_req;
  if not p_req.is_direct or not p_ok then
    perform public.approvals_activity_for(v_req, case when p_ok then 'approval.executed' else 'approval.failed' end,
      case when p_ok then v_req.decided_by end);
  end if;
  return v_req;
end;
$$;

create or replace function public.execute_refund(p_approval_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
  v_order public.orders%rowtype;
  v_snapshot jsonb;
  v_ledger jsonb;
  v_net numeric;
  v_amount numeric;
  v_scope text;
  v_alloc jsonb;
  v_a jsonb;
  v_cash boolean;
  v_refund_id uuid := gen_random_uuid();
  v_revision_id uuid;
  v_opening_id uuid;
  v_payment_ids uuid[] := '{}'::uuid[];
  v_payment_id uuid;
  v_number integer;
  v_label text;
  v_line jsonb;
  v_item public.order_items%rowtype;
  v_qty integer;
  v_lines jsonb := '[]'::jsonb;
  v_lines_value numeric := 0;
  v_items_before jsonb;
  v_items_after jsonb;
  v_total_after numeric;
  v_cancel boolean;
  v_status_changed boolean := false;
  v_vouchers integer := 0;
  v_method text;
  v_restock boolean;
  v_reason_label text;
  v_cashier uuid;
  v_result jsonb;
  v_code text;
  v_message text;
begin
  select * into v_req from public.approval_requests r where r.id = p_approval_id for update;
  if not found then
    return public.approval_refusal('not_found', 'This request could not be found.');
  end if;
  if v_req.status in ('executed', 'failed') then
    return jsonb_build_object('ok', v_req.status = 'executed', 'request', to_jsonb(v_req), 'replayed', true);
  end if;
  if v_req.status <> 'approved' or v_req.kind not in ('refund', 'cancel_paid') then
    return public.approval_refusal('not_approved', 'This request is not approved.');
  end if;

  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests set status = 'executing', updated_at = now()
   where id = v_req.id returning * into v_req;

  -- Activity triggers fired by the writes below (voucher.released, order.*)
  -- name the CASHIER who asked, not "System".
  perform set_config('app.actor_user_id', v_req.requested_by::text, true);

  v_snapshot := coalesce(v_req.order_snapshot, '{}'::jsonb);
  v_scope := case when v_req.kind = 'cancel_paid' then 'whole' else coalesce(v_req.payload ->> 'scope', 'amount') end;
  v_amount := coalesce(v_req.approved_amount, v_req.amount);
  v_restock := coalesce(v_req.payload ->> 'restock', 'false') = 'true';
  v_reason_label := coalesce(v_req.payload ->> 'reasonLabel', v_req.reason_code);
  v_cancel := v_scope = 'whole';

  begin
    select * into v_order from public.orders o
     where o.id = public.store_activity_try_uuid(v_req.external_order_id) and o.tenant_id = v_req.tenant_id
     for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'order_not_found',
        detail = 'The order was deleted since it was asked about. Nothing was refunded.';
    end if;

    -- The order must be what the approver saw.
    if v_order.revision_number is distinct from (v_snapshot ->> 'revisionNumber')::integer
       or v_order.total is distinct from (v_snapshot ->> 'total')::numeric then
      raise exception using errcode = 'P0001', message = 'order_changed',
        detail = 'The order changed since it was asked about. Nothing was refunded.';
    end if;
    if v_scope in ('items', 'amount') and v_order.status = 'cancelled' then
      raise exception using errcode = 'P0001', message = 'order_changed',
        detail = 'The order was cancelled since it was asked about. Nothing was refunded.';
    end if;

    v_ledger := public.approval_order_ledger(v_order.id);
    v_net := coalesce((v_ledger ->> 'net')::numeric, 0);
    if v_scope = 'whole' and v_net is distinct from ((v_snapshot -> 'ledger') ->> 'net')::numeric then
      raise exception using errcode = 'P0001', message = 'order_changed',
        detail = 'A payment on this order changed since it was asked about. Nothing was refunded.';
    end if;
    if v_amount <= 0 or v_amount > v_net then
      raise exception using errcode = 'P0001', message = 'over_refund',
        detail = 'That is more than is left to refund on this order. Nothing was refunded.';
    end if;

    v_alloc := public.approval_refund_allocation(v_ledger, v_amount);
    if jsonb_array_length(v_alloc) = 0 then
      raise exception using errcode = 'P0001', message = 'over_refund',
        detail = 'The payments on this order cannot cover that refund. Nothing was refunded.';
    end if;
    select coalesce(bool_or((a ->> 'isCash')::boolean), false) into v_cash from jsonb_array_elements(v_alloc) a;
    if v_cash and public.approval_open_shift(v_req.tenant_id, v_req.requested_by, v_order.outlet_id) is null then
      raise exception using errcode = 'P0001', message = 'no_open_shift',
        detail = coalesce(v_req.requested_by_name, 'The cashier') || ' has no open drawer at this branch, so the cash cannot come out of it. Nothing was refunded.';
    end if;

    -- Items: re-price the lines from what is stored now (same revision).
    if v_scope = 'items' then
      for v_line in select value from jsonb_array_elements(coalesce(v_req.payload -> 'lines', '[]'::jsonb)) loop
        select * into v_item from public.order_items i
         where i.id = public.store_activity_try_uuid(v_line ->> 'orderItemId') and i.order_id = v_order.id
         for update;
        v_qty := (v_line ->> 'quantity')::integer;
        if v_item.id is null or v_qty is null or v_qty <= 0 or v_qty > v_item.quantity then
          raise exception using errcode = 'P0001', message = 'order_changed',
            detail = 'An item on this order changed since it was asked about. Nothing was refunded.';
        end if;
        v_lines_value := v_lines_value + public.approval_line_value(v_item.subtotal, v_item.discount_amount, v_item.quantity, v_qty);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'orderItemId', v_item.id, 'menuItemId', v_item.menu_item_id, 'name', v_item.menu_item_name,
          'quantity', v_qty,
          'amount', public.approval_line_value(v_item.subtotal, v_item.discount_amount, v_item.quantity, v_qty)));
        end loop;
      if abs(v_lines_value - v_req.amount) > 0.01 then
        raise exception using errcode = 'P0001', message = 'order_changed',
          detail = 'The prices on this order changed since it was asked about. Nothing was refunded.';
      end if;
    elsif v_scope = 'whole' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'orderItemId', i.id, 'menuItemId', i.menu_item_id, 'name', i.menu_item_name, 'quantity', i.quantity,
               'amount', public.approval_line_value(i.subtotal, i.discount_amount, i.quantity, i.quantity))), '[]'::jsonb)
        into v_lines
        from public.order_items i where i.order_id = v_order.id;
    end if;

    -- R-number.
    insert into public.order_refund_counters as c (tenant_id, last_number)
    values (v_req.tenant_id, 1)
    on conflict (tenant_id) do update set last_number = c.last_number + 1
    returning last_number into v_number;
    v_label := 'R-' || lpad(v_number::text, greatest(4, length(v_number::text)), '0');

    -- An order paid before the ledger existed gets its original payment
    -- written first (at the sale's time, by the cashier who rang it), so the
    -- refund nets against something and every drawer computation
    -- (webnegosyo-app/lib/shift-drawer.ts) still credits the original sale
    -- to the original shift.
    if coalesce((v_ledger ->> 'implicit')::boolean, false) then
      v_opening_id := gen_random_uuid();
      v_cashier := public.store_activity_try_uuid(v_order.customer_data -> 'pos' ->> 'cashierId');
    end if;

    for v_a in select value from jsonb_array_elements(v_alloc) loop
      v_payment_ids := v_payment_ids || gen_random_uuid();
    end loop;
    if v_scope in ('items', 'amount') then
      v_revision_id := gen_random_uuid();
    end if;
    select string_agg(distinct coalesce(a ->> 'methodName', 'Unrecorded method'), ' + ')
      into v_method from jsonb_array_elements(v_alloc) a;

    -- The refund record goes in FIRST: the activity trigger wrappers below
    -- recognise these payment / revision ids and stay quiet, because ONE
    -- refund.issued row (written further down) tells this story.
    insert into public.order_refunds (
      id, tenant_id, outlet_id, order_id, refund_number, scope, lines, amount, method,
      payment_row_ids, opening_payment_id, revision_id, approval_id, reason_code, reason, note,
      restock, cancelled_order, issued_by, issued_by_name, approved_by, approved_by_name
    ) values (
      v_refund_id, v_req.tenant_id, v_order.outlet_id, v_order.id::text, v_number, v_scope, v_lines, v_amount, v_method,
      v_payment_ids, v_opening_id, v_revision_id, v_req.id, v_req.reason_code, v_reason_label, v_req.note,
      v_restock, v_cancel and v_order.status <> 'cancelled',
      v_req.requested_by, v_req.requested_by_name,
      case when v_req.is_direct then null else v_req.decided_by end,
      case when v_req.is_direct then null else v_req.decided_by_name end
    );

    if v_opening_id is not null then
      insert into public.order_payments (
        id, tenant_id, order_id, kind, amount, payment_method_id, payment_method_name,
        recorded_by, outlet_id, note, created_at
      ) values (
        v_opening_id, v_order.tenant_id, v_order.id, 'charge', v_order.total,
        v_order.payment_method_id,
        coalesce(v_order.payment_method_name, (v_ledger -> 'tenders' -> 0 ->> 'methodName')),
        v_cashier, v_order.outlet_id,
        'Opening record: paid before the payment ledger (written with refund ' || v_label || ')',
        v_order.created_at
      );
    end if;

    -- The money: one refund row per tender, recorded_by = the CASHIER who
    -- asked (their drawer pays it out), never the approver.
    for v_a, v_payment_id in
      select a.value, ids.id
        from jsonb_array_elements(v_alloc) with ordinality a(value, n)
        join unnest(v_payment_ids) with ordinality ids(id, n) using (n)
    loop
      insert into public.order_payments (
        id, tenant_id, order_id, kind, amount, payment_method_id, payment_method_name,
        recorded_by, outlet_id, note, created_at
      ) values (
        v_payment_id, v_order.tenant_id, v_order.id, 'refund', (v_a ->> 'amount')::numeric,
        public.store_activity_try_uuid(v_a ->> 'methodId'), v_a ->> 'methodName',
        v_req.requested_by, v_order.outlet_id,
        'Refund ' || v_label || ' · ' || v_reason_label, now()
      );
    end loop;

    -- Items / amount: the bill shrinks by what went back, as a revision.
    if v_scope in ('items', 'amount') then
      v_items_before := public.approval_order_items_json(v_order.id);
      if v_scope = 'items' then
        for v_line in select value from jsonb_array_elements(v_lines) loop
          select * into v_item from public.order_items i where i.id = (v_line ->> 'orderItemId')::uuid;
          v_qty := (v_line ->> 'quantity')::integer;
          if v_qty >= v_item.quantity then
            delete from public.order_items where id = v_item.id;
          else
            update public.order_items
               set quantity = v_item.quantity - v_qty,
                   subtotal = round(v_item.subtotal * (v_item.quantity - v_qty) / v_item.quantity, 2),
                   discount_amount = round(v_item.discount_amount * (v_item.quantity - v_qty) / v_item.quantity, 2)
             where id = v_item.id;
          end if;
            end loop;
      end if;
      v_items_after := public.approval_order_items_json(v_order.id);
      v_total_after := greatest(round(v_order.total - v_amount, 2), 0);

      insert into public.order_revisions (
        id, tenant_id, order_id, revision_number, items_before, items_after,
        total_before, total_after, reason, revised_by, outlet_id, created_at
      ) values (
        v_revision_id, v_order.tenant_id, v_order.id, v_order.revision_number + 1, v_items_before, v_items_after,
        v_order.total, v_total_after, 'Refund ' || v_label || ' · ' || v_reason_label,
        v_req.requested_by, v_order.outlet_id, now()
      );

      update public.orders
         set total = v_total_after,
             revision_number = v_order.revision_number + 1,
             item_count = (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = v_order.id),
             edited_at = now(),
             edited_by = v_req.requested_by
       where id = v_order.id;
    end if;

    -- Whole / cancel paid: the order is cancelled and its vouchers come back.
    if v_cancel then
      if v_order.status <> 'cancelled' then
        -- Our own order.cancelled row, under the key the orders trigger would
        -- use (set_updated_at stamps now(), the transaction's time), so the
        -- trigger's ON CONFLICT drops its copy: this one names the approver
        -- and carries no paid_then_cancelled flag — the refund IS recorded.
        perform public.approvals_activity(
          p_tenant_id => v_order.tenant_id, p_kind => 'order.cancelled',
          p_event_key => 'orders:' || v_order.id || ':status:cancelled:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
          p_source_table => 'orders', p_source_id => v_order.id::text,
          p_outlet_id => v_order.outlet_id, p_actor_user_id => v_req.requested_by,
          p_approved_by => case when v_req.is_direct then null else v_req.decided_by end,
          p_amount => v_order.total, p_reason => v_reason_label, p_note => v_req.note,
          p_subject_type => 'order', p_subject_ref => v_order.id::text,
          p_order_number => public.store_activity_order_label(v_order.daily_number, v_order.id::text),
          p_external_order_id => v_order.id::text,
          p_before => jsonb_build_object('status', v_order.status),
          p_after => jsonb_build_object('status', 'cancelled'),
          p_summary => jsonb_strip_nulls(jsonb_build_object(
            'title', public.store_activity_order_label(v_order.daily_number, v_order.id::text) || ' cancelled',
            'refundNumber', v_label, 'amountRefunded', v_amount, 'approvalId', v_req.id,
            'customer', public.store_activity_mask_name(v_order.customer_name), 'source', v_order.source)),
          p_flags => case when public.store_activity_flag_repeat_cancels(v_order.tenant_id, v_req.requested_by, now())
                          then array['repeat_cancels'] else '{}'::text[] end);
        update public.orders
           set status = 'cancelled',
               cancel_reason = left(v_reason_label, 500)
         where id = v_order.id;
        v_status_changed := true;
      end if;
      v_vouchers := public.release_voucher_redemptions(v_order.tenant_id, v_order.id::text);
    end if;

    -- The one refund.issued row, with both names.
    perform public.approvals_activity(
      p_tenant_id => v_order.tenant_id, p_kind => 'refund.issued',
      p_event_key => 'order_refunds:' || v_refund_id,
      p_source_table => 'order_refunds', p_source_id => v_refund_id::text,
      p_outlet_id => v_order.outlet_id, p_actor_user_id => v_req.requested_by,
      p_approved_by => case when v_req.is_direct then null else v_req.decided_by end,
      p_amount => -v_amount, p_reason => v_reason_label, p_note => v_req.note,
      p_subject_type => 'order', p_subject_ref => v_order.id::text,
      p_order_number => public.store_activity_order_label(v_order.daily_number, v_order.id::text),
      p_external_order_id => v_order.id::text,
      p_before => jsonb_build_object('total', v_order.total, 'amountPaid', v_net),
      p_after => jsonb_build_object('total', coalesce(v_total_after, v_order.total), 'amountPaid', v_net - v_amount),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', 'Refunded ' || public.store_activity_peso(v_amount) || ' on '
                 || public.store_activity_order_label(v_order.daily_number, v_order.id::text) || ' · ' || v_label,
        'refundNumber', v_label, 'scope', v_scope, 'paymentMethod', v_method,
        'approvalId', v_req.id, 'direct', v_req.is_direct, 'cancelled', v_status_changed,
        'lines', case when jsonb_array_length(v_lines) > 0 and v_scope = 'items' then v_lines end)),
      p_strict => true);

    v_result := jsonb_build_object(
      'refundId', v_refund_id, 'refundNumber', v_number, 'refundLabel', v_label,
      'amount', v_amount, 'scope', v_scope, 'paymentRowIds', to_jsonb(v_payment_ids),
      'openingPaymentId', v_opening_id, 'revisionId', v_revision_id,
      'revisionNumber', case when v_revision_id is not null then v_order.revision_number + 1 end,
      'statusChanged', v_status_changed, 'vouchersReleased', v_vouchers,
      'cashInvolved', v_cash, 'restock', v_restock, 'lines', v_lines, 'allocation', v_alloc);
  exception when others then
    get stacked diagnostics v_code = message_text, v_message = pg_exception_detail;
    if v_code not in ('order_not_found', 'order_changed', 'over_refund', 'no_open_shift') then
      raise warning 'execute_refund(%) failed: % (%)', p_approval_id, sqlerrm, sqlstate;
      v_message := 'Something went wrong while refunding. Nothing was refunded.';
      v_code := 'execution_error';
    end if;
    v_req := public.approval_finish(v_req, false, jsonb_build_object('code', v_code), v_message);
    return public.approval_refusal(v_code, v_message) || jsonb_build_object('request', to_jsonb(v_req));
  end;

  v_req := public.approval_finish(v_req, true, v_result, null);
  return jsonb_build_object('ok', true, 'request', to_jsonb(v_req), 'result', v_result);
end;
$$;

-- ============================================
-- 15. Execution: discount (a one-use token the register redeems)
-- ============================================
-- The register applies the discount through its normal path; the token proves
-- an approver said yes to exactly this amount on exactly this order.
-- consume_discount_approval() burns it. (Enforcing a token at the register's
-- discount write is a follow-up; see the Phase 3 report.)
create or replace function public.execute_discount_approval(p_approval_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
  v_result jsonb;
begin
  select * into v_req from public.approval_requests r where r.id = p_approval_id for update;
  if not found or v_req.kind <> 'discount' then
    return public.approval_refusal('not_found', 'This request could not be found.');
  end if;
  if v_req.status in ('executed', 'failed') then
    return jsonb_build_object('ok', v_req.status = 'executed', 'request', to_jsonb(v_req), 'replayed', true);
  end if;
  if v_req.status <> 'approved' then
    return public.approval_refusal('not_approved', 'This request is not approved.');
  end if;
  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests set status = 'executing', updated_at = now()
   where id = v_req.id returning * into v_req;
  v_result := jsonb_build_object(
    -- 244 random bits from two v4 uuids (gen_random_uuid is core; no pgcrypto schema dependency).
    'discountToken', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    'amountOff', coalesce(v_req.approved_amount, v_req.amount),
    'pct', v_req.payload -> 'pct',
    'orderId', v_req.external_order_id,
    'tokenExpiresAt', now() + interval '2 hours',
    'consumedAt', null);
  v_req := public.approval_finish(v_req, true, v_result, null);
  return jsonb_build_object('ok', true, 'request', to_jsonb(v_req), 'result', v_result);
end;
$$;

create or replace function public.consume_discount_approval(p_tenant_id uuid, p_order_id text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
begin
  select * into v_req from public.approval_requests r
   where r.tenant_id = p_tenant_id and r.kind = 'discount' and r.status = 'executed'
     and r.external_order_id = p_order_id and r.result ->> 'discountToken' = p_token
   for update;
  if not found then
    return public.approval_refusal('not_found', 'That discount approval is not valid for this order.');
  end if;
  if (v_req.result ->> 'consumedAt') is not null then
    return public.approval_refusal('already_used', 'That discount approval was already used.');
  end if;
  if (v_req.result ->> 'tokenExpiresAt')::timestamptz < now() then
    return public.approval_refusal('expired', 'That discount approval expired. Ask again.');
  end if;
  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests
     set result = result || jsonb_build_object('consumedAt', now()), updated_at = now()
   where id = v_req.id returning * into v_req;
  return jsonb_build_object('ok', true, 'amountOff', v_req.result -> 'amountOff', 'pct', v_req.result -> 'pct');
end;
$$;

-- ============================================
-- 16. Execution: stock write-off
-- ============================================
create or replace function public.execute_stock_writeoff(p_approval_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
  v_movement_id uuid := gen_random_uuid();
  v_qty numeric;
  v_cost numeric;
  v_result jsonb;
  v_code text;
  v_message text;
begin
  select * into v_req from public.approval_requests r where r.id = p_approval_id for update;
  if not found or v_req.kind <> 'stock_writeoff' then
    return public.approval_refusal('not_found', 'This request could not be found.');
  end if;
  if v_req.status in ('executed', 'failed') then
    return jsonb_build_object('ok', v_req.status = 'executed', 'request', to_jsonb(v_req), 'replayed', true);
  end if;
  if v_req.status <> 'approved' then
    return public.approval_refusal('not_approved', 'This request is not approved.');
  end if;
  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests set status = 'executing', updated_at = now()
   where id = v_req.id returning * into v_req;
  perform set_config('app.actor_user_id', v_req.requested_by::text, true);

  v_qty := (v_req.payload ->> 'quantity')::numeric;
  begin
    select i.unit_cost into v_cost from public.inventory_items i
     where i.id = (v_req.payload ->> 'inventoryItemId')::uuid and i.tenant_id = v_req.tenant_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'not_found',
        detail = 'That ingredient was removed since it was asked about. Nothing was written off.';
    end if;
    -- client_request_id = the approval: a replay can never write it off twice.
    insert into public.stock_movements (
      id, tenant_id, inventory_item_id, reason, quantity_delta, balance_after, unit_cost,
      note, created_by, outlet_id, client_request_id, created_at
    ) values (
      v_movement_id, v_req.tenant_id, (v_req.payload ->> 'inventoryItemId')::uuid, 'waste', -v_qty, 0, v_cost,
      left(coalesce(v_req.payload ->> 'reasonLabel', v_req.reason_code)
           || coalesce(' · ' || v_req.note, '') || ' (approved)', 500),
      v_req.requested_by, v_req.outlet_id, v_req.id, now()
    );
    v_result := jsonb_build_object('stockMovementId', v_movement_id, 'quantity', v_qty, 'unitCost', v_cost,
                                   'amount', round(v_qty * coalesce(v_cost, 0), 2));
  exception when others then
    get stacked diagnostics v_code = message_text, v_message = pg_exception_detail;
    if v_code <> 'not_found' then
      raise warning 'execute_stock_writeoff(%) failed: % (%)', p_approval_id, sqlerrm, sqlstate;
      v_code := 'execution_error';
      v_message := 'Something went wrong while writing this off. Nothing was written off.';
    end if;
    v_req := public.approval_finish(v_req, false, jsonb_build_object('code', v_code), v_message);
    return public.approval_refusal(v_code, v_message) || jsonb_build_object('request', to_jsonb(v_req));
  end;
  v_req := public.approval_finish(v_req, true, v_result, null);
  return jsonb_build_object('ok', true, 'request', to_jsonb(v_req), 'result', v_result);
end;
$$;

create or replace function public.execute_approval(p_approval_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select r.kind into v_kind from public.approval_requests r where r.id = p_approval_id and r.tenant_id = p_tenant_id;
  if v_kind is null then
    return public.approval_refusal('not_found', 'This request could not be found.');
  end if;
  return case v_kind
    when 'discount' then public.execute_discount_approval(p_approval_id)
    when 'stock_writeoff' then public.execute_stock_writeoff(p_approval_id)
    else public.execute_refund(p_approval_id)
  end;
end;
$$;

-- ============================================
-- 17. One call per user action
-- ============================================
-- Approve = transition + execute in the SAME transaction: an approval either
-- finishes (executed) or leaves a failed row; there is no approved-but-stuck.
create or replace function public.decide_approval(
  p_id uuid, p_tenant_id uuid, p_actor uuid, p_decision text,
  p_reason_code text default null, p_note text default null, p_approved_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if p_decision not in ('approve', 'decline') then
    return public.approval_refusal('invalid_transition', 'Unknown decision.');
  end if;
  v_out := public.transition_approval(p_id, p_tenant_id, p_actor,
    case when p_decision = 'approve' then 'approved' else 'declined' end,
    p_reason_code, p_note, p_approved_amount);
  if not coalesce((v_out ->> 'ok')::boolean, false) or p_decision = 'decline' then
    return v_out;
  end if;
  return public.execute_approval(p_id, p_tenant_id);
end;
$$;

-- Direct = create (approved, is_direct) + execute, one transaction.
create or replace function public.create_and_execute_approval(
  p_tenant_id uuid, p_user_id uuid, p_kind text, p_external_order_id text, p_payload jsonb,
  p_reason_code text, p_note text, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
  v_id uuid;
begin
  v_out := public.create_approval_request(p_tenant_id, p_user_id, p_kind, p_external_order_id, p_payload,
    p_reason_code, p_note, p_idempotency_key, true);
  if not coalesce((v_out ->> 'ok')::boolean, false) or coalesce((v_out ->> 'replayed')::boolean, false) then
    return v_out;
  end if;
  v_id := (v_out -> 'request' ->> 'id')::uuid;
  return public.execute_approval(v_id, p_tenant_id);
end;
$$;

create or replace function public.withdraw_approval(p_id uuid, p_tenant_id uuid, p_actor uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.transition_approval(p_id, p_tenant_id, p_actor, 'withdrawn')
$$;

-- The post-commit side effects (stock, presell, loyalty, status events) are
-- reported back onto the finished row. Only result.sideEffects changes.
create or replace function public.record_approval_side_effects(p_id uuid, p_tenant_id uuid, p_side_effects jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_side_effects) <> 'object' then
    return false;
  end if;
  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests
     set result = coalesce(result, '{}'::jsonb) || jsonb_build_object('sideEffects', p_side_effects),
         updated_at = now()
   where id = p_id and tenant_id = p_tenant_id and status in ('executed', 'failed');
  return found;
end;
$$;

-- ============================================
-- 18. Rules write (owner only, enforced by the route AND here)
-- ============================================
create or replace function public.set_approval_rules(p_tenant_id uuid, p_actor uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb := public.approval_rules_effective(p_tenant_id);
  v_after jsonb;
  v_stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS');
begin
  if not public.approval_user_is_owner(p_tenant_id, p_actor) then
    return public.approval_refusal('forbidden', 'Only the owner can change approval rules.');
  end if;
  insert into public.approval_rules as r (
    tenant_id, direct_refund_cap, manager_approve_cap, staff_refund_window, discount_pct_needs_approval,
    writeoff_cost_needs_approval, expiry_minutes, max_pending_per_staff, updated_at, updated_by, updated_by_name
  ) values (
    p_tenant_id,
    coalesce((p_rules ->> 'directRefundCap')::numeric, (v_before ->> 'directRefundCap')::numeric),
    coalesce((p_rules ->> 'managerApproveCap')::numeric, (v_before ->> 'managerApproveCap')::numeric),
    coalesce(p_rules ->> 'staffRefundWindow', v_before ->> 'staffRefundWindow'),
    coalesce((p_rules ->> 'discountPctNeedsApproval')::numeric, (v_before ->> 'discountPctNeedsApproval')::numeric),
    coalesce((p_rules ->> 'writeoffCostNeedsApproval')::numeric, (v_before ->> 'writeoffCostNeedsApproval')::numeric),
    coalesce((p_rules ->> 'expiryMinutes')::integer, (v_before ->> 'expiryMinutes')::integer),
    coalesce((p_rules ->> 'maxPendingPerStaff')::integer, (v_before ->> 'maxPendingPerStaff')::integer),
    now(), p_actor, public.store_activity_actor_name(p_actor)
  )
  on conflict (tenant_id) do update set
    direct_refund_cap = excluded.direct_refund_cap,
    manager_approve_cap = excluded.manager_approve_cap,
    staff_refund_window = excluded.staff_refund_window,
    discount_pct_needs_approval = excluded.discount_pct_needs_approval,
    writeoff_cost_needs_approval = excluded.writeoff_cost_needs_approval,
    expiry_minutes = excluded.expiry_minutes,
    max_pending_per_staff = excluded.max_pending_per_staff,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name;

  v_after := public.approval_rules_effective(p_tenant_id);
  if (v_before - array['updatedAt', 'updatedByName']) <> (v_after - array['updatedAt', 'updatedByName']) then
    perform public.approvals_activity(
      p_tenant_id => p_tenant_id, p_kind => 'rules.changed',
      p_event_key => 'approval_rules:' || p_tenant_id || ':' || v_stamp,
      p_source_table => 'approval_rules', p_source_id => p_tenant_id::text,
      p_actor_user_id => p_actor, p_subject_type => 'setting', p_subject_ref => 'approval_rules',
      p_before => v_before - array['updatedAt', 'updatedByName'],
      p_after => v_after - array['updatedAt', 'updatedByName'],
      p_summary => jsonb_build_object('title', 'Approval rules changed'));
  end if;
  return jsonb_build_object('ok', true, 'rules', v_after);
end;
$$;

-- ============================================
-- 19. Keep Phase 1 from double-reporting a refund
-- ============================================
-- execute_refund writes ONE refund.issued row (with the approver) and, for a
-- whole refund, its own order.cancelled row. The payment rows it splits the
-- money into, the opening record and the revision it writes would each make
-- their own row through the Phase 1 triggers; the order_refunds row is
-- inserted first, so these wrappers recognise them and stay quiet. Every
-- other payment / revision is captured exactly as before.
create or replace function public.store_activity_on_order_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.store_activity_on_order_revisions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ============================================
-- 20. Lock the functions: service role only
-- ============================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.approval_user_can(uuid, uuid, text)',
    'public.approval_user_is_owner(uuid, uuid)',
    'public.approval_user_reaches(uuid, uuid, uuid)',
    'public.approval_rules_effective(uuid)',
    'public.approval_approver_cap(uuid, uuid)',
    'public.approval_direct_allowed(uuid, uuid, text, numeric, timestamptz, numeric)',
    'public.approval_may_request(uuid, uuid, text)',
    'public.approvals_activity(uuid, text, text, text, text, uuid, uuid, uuid, numeric, text, text, text, text, text, text, jsonb, jsonb, jsonb, text[], boolean)',
    'public.approvals_activity_for(public.approval_requests, text, uuid)',
    'public.approval_order_ledger(uuid)',
    'public.approval_refund_allocation(jsonb, numeric)',
    'public.approval_order_items_json(uuid)',
    'public.approval_order_snapshot(uuid)',
    'public.approval_open_shift(uuid, uuid, uuid)',
    'public.approval_quote(uuid, uuid, text, text, jsonb)',
    'public.create_approval_request(uuid, uuid, text, text, jsonb, text, text, text, boolean)',
    'public.expire_approval_requests(uuid, integer)',
    'public.transition_approval(uuid, uuid, uuid, text, text, text, numeric)',
    'public.release_voucher_redemptions(uuid, text)',
    'public.approval_finish(public.approval_requests, boolean, jsonb, text)',
    'public.execute_refund(uuid)',
    'public.execute_discount_approval(uuid)',
    'public.consume_discount_approval(uuid, text, text)',
    'public.execute_stock_writeoff(uuid)',
    'public.execute_approval(uuid, uuid)',
    'public.decide_approval(uuid, uuid, uuid, text, text, text, numeric)',
    'public.create_and_execute_approval(uuid, uuid, text, text, jsonb, text, text, text)',
    'public.withdraw_approval(uuid, uuid, uuid)',
    'public.record_approval_side_effects(uuid, uuid, jsonb)',
    'public.set_approval_rules(uuid, uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end;
$$;

-- Internal helpers the service role never needs to call directly.
revoke execute on function public.approvals_activity(uuid, text, text, text, text, uuid, uuid, uuid, numeric, text, text, text, text, text, text, jsonb, jsonb, jsonb, text[], boolean) from service_role;
revoke execute on function public.approvals_activity_for(public.approval_requests, text, uuid) from service_role;
revoke execute on function public.approval_finish(public.approval_requests, boolean, jsonb, text) from service_role;
revoke execute on function public.execute_refund(uuid) from service_role;
revoke execute on function public.execute_discount_approval(uuid) from service_role;
revoke execute on function public.execute_stock_writeoff(uuid) from service_role;
revoke execute on function public.transition_approval(uuid, uuid, uuid, text, text, text, numeric) from service_role;
revoke execute on function public.release_voucher_redemptions(uuid, text) from service_role;
revoke all on function public.approval_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function public.approval_line_value(numeric, numeric, integer, integer) from public, anon, authenticated;
revoke all on function public.approval_refusal(text, text) from public, anon, authenticated;

reset lock_timeout;

-- ============================================
-- Rollback (manual, in order)
-- ============================================
-- Restore the Phase 1 wrappers (20261012151000: store_activity_on_order_payments /
-- store_activity_on_order_revisions bodies = a single perform of the capture fn).
-- drop function if exists public.set_approval_rules(uuid, uuid, jsonb);
-- drop function if exists public.record_approval_side_effects(uuid, uuid, jsonb);
-- drop function if exists public.withdraw_approval(uuid, uuid, uuid);
-- drop function if exists public.create_and_execute_approval(uuid, uuid, text, text, jsonb, text, text, text);
-- drop function if exists public.decide_approval(uuid, uuid, uuid, text, text, text, numeric);
-- drop function if exists public.execute_approval(uuid, uuid);
-- drop function if exists public.execute_stock_writeoff(uuid);
-- drop function if exists public.consume_discount_approval(uuid, text, text);
-- drop function if exists public.execute_discount_approval(uuid);
-- drop function if exists public.execute_refund(uuid);
-- drop function if exists public.approval_finish(public.approval_requests, boolean, jsonb, text);
-- drop function if exists public.release_voucher_redemptions(uuid, text);
-- drop function if exists public.transition_approval(uuid, uuid, uuid, text, text, text, numeric);
-- drop function if exists public.expire_approval_requests(uuid, integer);
-- drop function if exists public.create_approval_request(uuid, uuid, text, text, jsonb, text, text, text, boolean);
-- drop function if exists public.approval_quote(uuid, uuid, text, text, jsonb);
-- drop function if exists public.approval_refusal(text, text);
-- drop function if exists public.approval_open_shift(uuid, uuid, uuid);
-- drop function if exists public.approval_order_snapshot(uuid);
-- drop function if exists public.approval_line_value(numeric, numeric, integer, integer);
-- drop function if exists public.approval_order_items_json(uuid);
-- drop function if exists public.approval_refund_allocation(jsonb, numeric);
-- drop function if exists public.approval_order_ledger(uuid);
-- drop function if exists public.approvals_activity_for(public.approval_requests, text, uuid);
-- drop function if exists public.approvals_activity(uuid, text, text, text, text, uuid, uuid, uuid, numeric, text, text, text, text, text, text, jsonb, jsonb, jsonb, text[], boolean);
-- drop function if exists public.approval_may_request(uuid, uuid, text);
-- drop function if exists public.approval_direct_allowed(uuid, uuid, text, numeric, timestamptz, numeric);
-- drop function if exists public.approval_approver_cap(uuid, uuid);
-- drop function if exists public.approval_rules_effective(uuid);
-- drop function if exists public.approval_user_reaches(uuid, uuid, uuid);
-- drop function if exists public.approval_user_is_owner(uuid, uuid);
-- drop function if exists public.approval_user_can(uuid, uuid, text);
-- drop table if exists public.order_refunds;
-- drop table if exists public.order_refund_counters;
-- drop table if exists public.approval_requests;   -- (also leaves supabase_realtime)
-- drop table if exists public.approval_rules;
-- drop function if exists public.approvals_append_only();
-- drop function if exists public.approval_requests_guard();
-- drop function if exists public.approval_transition_allowed(text, text);
-- alter table public.platform_device_tokens drop column if exists channels;
