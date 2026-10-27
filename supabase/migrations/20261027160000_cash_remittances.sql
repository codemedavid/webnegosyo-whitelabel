-- ===========================================================================
-- Remittances: cash handed from one person to another, accepted, disputed,
-- resolved (P5 of docs/plans/cashier-remittance, CONTRACTS W2.2, 07 §5.1).
--
--   cash_remittances        one 'shift' row per closed shift (mode ≠ off) and one
--                           'pickup' row per pickup. Counts stay on the shift;
--                           only what moved between people lives here.
--   creation                AFTER a shift closes through close_shift /
--                           force_close_shift (RPC mark; an old build's direct
--                           close files none): handed over = count − float kept
--                           (NULL for a forced close). Remit-to / safe come from
--                           close_shift (app.remit_to / app.remit_to_safe).
--   record_cash_pickup      a pickup = a `collect` movement + a pickup remittance,
--                           one transaction. shift_cash_movements gains
--                           taken_by / taken_by_name / to_safe.
--   accept / dispute / resolve (+ accept_remittance_as for the PIN route,
--                           service role only): definer, CAS on status, P0002
--                           when the row is no longer in the expected state.
--   list_cash_receivers     who cash can be handed to (no emails, no phones).
--
-- Reads are plain RLS reads of cash_remittances (the inbox embeds staff_shifts
-- through cash_remittances_shift_id_fkey); there is no list RPC.
-- Runner: tests/sql/run-cash-remittances.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- app_user_has_permission answers only for the CALLER (auth.uid()). The
-- receiver of a hand-over is someone else, so this is the same function for
-- any user: its body is the live app_user_has_permission (20261022130200)
-- with auth.uid() replaced by p_user — nothing else. A test pins the two
-- bodies equal (tests/unit/cash/permission-of-parity.test.ts): change
-- app_user_has_permission and this must follow.
create or replace function public.app_user_has_permission_of(p_user uuid, p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_users au
     where au.user_id = p_user
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin'
           and au.tenant_id = p_tenant_id
           and (
             au.is_owner is true
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses']))
             or p_permission = any (au.permissions)
             -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
             or (p_permission = 'reports' and 'analytics' = any (au.permissions))
           )
         )
       )
  );
$$;
revoke all on function public.app_user_has_permission_of(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_user_has_permission_of(uuid, uuid, text) to service_role;

-- Does p_user hold cash_manage for this store (app_user_has_permission's
-- rule) and reach this branch (app_user_may_reach_branch's rule)?
create or replace function cash.user_manages_cash(p_user uuid, p_tenant uuid, p_outlet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.app_user_has_permission_of(p_user, p_tenant, 'cash_manage')
     and exists (
       select 1 from public.app_users au
        where au.user_id = p_user
          and au.tenant_id = p_tenant
          and au.role = any (array['admin', 'superadmin'])
          and (au.outlet_id is null or coalesce(au.is_owner, false) or au.outlet_id is not distinct from p_outlet)
     )
$$;
revoke all on function cash.user_manages_cash(uuid, uuid, uuid) from public, anon, authenticated;

-- A person's name as the apps show it (never the email itself).
create or replace function cash.user_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(nullif(btrim(coalesce(nullif(btrim(au.display_name), ''), split_part(coalesce(au.email, ''), '@', 1))), ''), 80)
    from public.app_users au where au.user_id = p_user limit 1
$$;
revoke all on function cash.user_name(uuid) from public, anon, authenticated;

-- ============================================
-- Pickups: who took the cash, or the safe
-- ============================================
alter table public.shift_cash_movements
  add column if not exists taken_by uuid references auth.users(id) on delete set null,
  add column if not exists taken_by_name text,
  add column if not exists to_safe boolean not null default false;
comment on column public.shift_cash_movements.taken_by is 'For a pickup (collect): the person the cash was handed to. NULL with to_safe = the store safe.';

-- ============================================
-- cash_remittances
-- ============================================
create table if not exists public.cash_remittances (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  outlet_id         uuid references public.outlets(id) on delete restrict,
  kind              text not null,
  shift_id          uuid not null,
  movement_id       uuid,
  business_day      date not null,
  cashier_user_id   uuid references auth.users(id) on delete set null,
  cashier_name      text not null,
  -- count − float kept; NULL when the shift was force-closed (nobody counted).
  handed_over_cents bigint,
  remitted_to       uuid references auth.users(id) on delete set null,
  remitted_to_name  text,
  to_safe           boolean not null default false,
  status            text not null default 'pending',
  received_cents    bigint,
  received_by       uuid references auth.users(id) on delete set null,
  received_by_name  text,
  received_at       timestamptz,
  accept_method     text,
  is_self_received  boolean not null default false,
  receiver_note     text,
  dispute_reason    text,
  resolved_by       uuid references auth.users(id) on delete set null,
  resolved_by_name  text,
  resolved_at       timestamptz,
  resolved_note     text,
  created_at        timestamptz not null default now(),
  constraint cash_remittances_shift_id_fkey foreign key (shift_id) references public.staff_shifts(id) on delete restrict,
  constraint cash_remittances_movement_id_fkey foreign key (movement_id) references public.shift_cash_movements(id) on delete restrict,
  constraint cash_remittances_kind_ck check (kind in ('shift', 'pickup')),
  constraint cash_remittances_pickup_ck check ((kind = 'pickup') = (movement_id is not null)),
  constraint cash_remittances_status_ck check (status in ('pending', 'accepted', 'disputed', 'resolved')),
  constraint cash_remittances_method_ck check (accept_method is null or accept_method in ('app', 'pin')),
  constraint cash_remittances_amounts_ck check (
    (handed_over_cents is null or handed_over_cents between 0 and 10000000000)
    and (received_cents is null or received_cents between 0 and 10000000000)),
  constraint cash_remittances_received_ck check ((status = 'pending') = (received_at is null)),
  constraint cash_remittances_notes_ck check (
    coalesce(char_length(receiver_note), 0) <= 300 and coalesce(char_length(dispute_reason), 0) <= 300
    and coalesce(char_length(resolved_note), 0) <= 300),
  -- A different amount is never accepted silently.
  constraint cash_remittances_discrepancy_note_ck check (
    status <> 'accepted' or handed_over_cents is null or received_cents is not distinct from handed_over_cents
    or char_length(btrim(coalesce(receiver_note, ''))) > 0),
  constraint cash_remittances_dispute_ck check (
    status not in ('disputed', 'resolved') or char_length(btrim(coalesce(dispute_reason, ''))) > 0),
  constraint cash_remittances_resolved_ck check ((status = 'resolved') = (resolved_at is not null))
);
comment on table public.cash_remittances is
  'Cash handed over: one row per closed shift (kind shift) and per pickup (kind pickup). pending → accepted | disputed → resolved, only through the definer RPCs.';

create unique index if not exists cash_remittances_one_per_shift on public.cash_remittances (shift_id) where kind = 'shift';
create unique index if not exists cash_remittances_one_per_movement on public.cash_remittances (movement_id) where movement_id is not null;
create index if not exists cash_remittances_tenant_day on public.cash_remittances (tenant_id, business_day desc);
create index if not exists cash_remittances_open on public.cash_remittances (tenant_id, status) where status in ('pending', 'disputed');
create index if not exists cash_remittances_receiver on public.cash_remittances (remitted_to, status) where remitted_to is not null;

alter table public.cash_remittances enable row level security;
-- The cashier reads their own; the person it was handed to reads it; a cash
-- manager reads every remittance they reach. No client writes: the RPCs are
-- the state machine.
drop policy if exists cash_remittances_read on public.cash_remittances;
create policy cash_remittances_read on public.cash_remittances for select to authenticated
  using (public.app_user_may_reach_branch(tenant_id, outlet_id)
         and (cashier_user_id = auth.uid() or remitted_to = auth.uid() or public.app_user_manages_cash(tenant_id)));
revoke all on public.cash_remittances from anon, authenticated;
grant select on public.cash_remittances to authenticated;
grant all on public.cash_remittances to service_role;

-- One activity row per remittance event.
create or replace function cash.record_remittance_activity(r public.cash_remittances, p_kind text, p_event text, p_flags text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_record(
    p_tenant_id => r.tenant_id, p_kind => p_kind,
    p_event_key => 'cash_remittances:' || r.id || ':' || p_event,
    p_source_table => 'cash_remittances', p_source_id => r.id::text, p_occurred_at => now(),
    p_outlet_id => r.outlet_id, p_actor_user_id => auth.uid(),
    p_amount => coalesce(r.received_cents, r.handed_over_cents)::numeric / 100,
    p_note => coalesce(r.resolved_note, r.dispute_reason, r.receiver_note),
    p_subject_type => 'remittance', p_subject_ref => r.id::text,
    p_after => jsonb_strip_nulls(jsonb_build_object('status', r.status, 'kind', r.kind,
      'handedOverCents', r.handed_over_cents, 'receivedCents', r.received_cents, 'toSafe', r.to_safe)),
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', case p_kind
        when 'cash.remitted' then r.cashier_name || ' handed over ' || coalesce(public.store_activity_peso(r.handed_over_cents::numeric / 100), 'an uncounted drawer')
          || case when r.to_safe then ' · to the safe' when r.remitted_to_name is not null then ' · to ' || r.remitted_to_name else '' end
        when 'cash.remittance_accepted' then coalesce(r.received_by_name, 'Someone') || ' received ' || public.store_activity_peso(r.received_cents::numeric / 100)
          || ' from ' || r.cashier_name
        when 'cash.remittance_disputed' then coalesce(r.received_by_name, 'Someone') || ' disputed ' || r.cashier_name || '''s hand-over'
        else 'Hand-over from ' || r.cashier_name || ' resolved'
      end,
      'cashierName', r.cashier_name, 'kind', r.kind)),
    p_flags => p_flags);
end;
$$;
revoke all on function cash.record_remittance_activity(public.cash_remittances, text, text, text[]) from public, anon, authenticated;

-- ============================================
-- Creation on close
-- ============================================
create or replace function cash.create_shift_remittance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := (cash.settings_of(new.tenant_id)).remittance_mode;
  v_to uuid;
  v_to_raw text := nullif(coalesce(current_setting('app.remit_to', true), ''), '');
  v_safe boolean := coalesce(current_setting('app.remit_to_safe', true), '') = 'on';
  v_float bigint;
  v_handed bigint;
  r public.cash_remittances;
begin
  if not (old.status = 'open' and new.status = 'closed') or v_mode = 'off' then
    return null;
  end if;
  -- Only closes made through close_shift / force_close_shift (their RPC mark)
  -- file a hand-over. An old build's direct close files none, so old tablets
  -- never leave pending hand-overs or "waiting to be accepted" pushes.
  if cash.shift_rpc_mark(new.id) <> 'close' then
    return null;
  end if;
  if v_to_raw is not null then
    begin
      v_to := v_to_raw::uuid;
    exception when invalid_text_representation then
      raise exception 'remit_to_invalid: pick someone who handles cash.' using errcode = '22023';
    end;
    if not cash.user_manages_cash(v_to, new.tenant_id, new.outlet_id) then
      raise exception 'remit_to_invalid: that person cannot receive cash at this branch.' using errcode = '22023';
    end if;
  end if;
  if new.close_kind = 'forced' or new.closing_count is null then
    v_handed := null;
  else
    v_float := coalesce(new.float_kept_cents,
                        case when new.is_zero_balance then 0 else least(round(new.opening_float * 100), round(new.closing_count * 100))::bigint end);
    v_handed := greatest(round(new.closing_count * 100)::bigint - v_float, 0);
  end if;
  insert into public.cash_remittances (tenant_id, outlet_id, kind, shift_id, business_day, cashier_user_id, cashier_name,
                                       handed_over_cents, remitted_to, remitted_to_name, to_safe)
  values (new.tenant_id, new.outlet_id, 'shift', new.id, new.business_day, new.staff_user_id, new.staff_name,
          v_handed, v_to, cash.user_name(v_to), v_safe and v_to is null)
  on conflict do nothing
  returning * into r;
  if r.id is not null then
    perform cash.record_remittance_activity(r, 'cash.remitted', 'remitted');
  end if;
  return null;
end;
$$;
revoke all on function cash.create_shift_remittance() from public, anon, authenticated;

drop trigger if exists trg_staff_shift_remittance on public.staff_shifts;
create trigger trg_staff_shift_remittance after update of status on public.staff_shifts
  for each row when (old.status is distinct from new.status)
  execute function cash.create_shift_remittance();

-- ============================================
-- record_cash_pickup
-- ============================================
create or replace function public.record_cash_pickup(
  p_shift_id uuid, p_amount_cents bigint, p_taken_by uuid default null, p_to_safe boolean default false, p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.staff_shifts%rowtype;
  v_access text;
  v_taken uuid := p_taken_by;
  v_name text := cash.actor_name();
  v_movement uuid;
  r public.cash_remittances;
  v_self boolean;
begin
  select * into s from public.staff_shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift was not found.' using errcode = 'P0002';
  end if;
  v_access := cash.shift_access(s);
  if v_uid is null or v_access = 'none' then
    raise exception 'Only the cashier on this shift or someone who handles cash can record a pickup.' using errcode = '42501';
  end if;
  if s.status <> 'open' then
    raise exception 'This shift is already closed.' using errcode = '55000';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 1000000000 then
    raise exception 'A pickup is between ₱0.01 and ₱10,000,000.' using errcode = '22023';
  end if;
  if coalesce(p_to_safe, false) then
    v_taken := null;
  else
    if v_taken is null and v_access = 'manager' then
      v_taken := v_uid;  -- the manager took it themselves
    end if;
    if v_taken is null then
      raise exception 'taken_by_required: say who took the cash, or that it went to the safe.' using errcode = '22023';
    end if;
    if not cash.user_manages_cash(v_taken, s.tenant_id, s.outlet_id) then
      raise exception 'taken_by_invalid: that person cannot receive cash at this branch.' using errcode = '22023';
    end if;
  end if;

  insert into public.shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by, recorded_by_name,
                                           taken_by, taken_by_name, to_safe)
  values (s.tenant_id, s.id, 'collect', p_amount_cents::numeric / 100, nullif(btrim(coalesce(p_note, '')), ''),
          v_uid, coalesce(v_name, 'Staff'), v_taken, cash.user_name(v_taken), coalesce(p_to_safe, false))
  returning id into v_movement;

  -- A manager who took it themselves has it in hand: received at once.
  v_self := v_taken is not null and v_taken = v_uid;
  insert into public.cash_remittances (tenant_id, outlet_id, kind, shift_id, movement_id, business_day, cashier_user_id, cashier_name,
                                       handed_over_cents, remitted_to, remitted_to_name, to_safe,
                                       status, received_cents, received_by, received_by_name, received_at, accept_method, is_self_received)
  values (s.tenant_id, s.outlet_id, 'pickup', s.id, v_movement, s.business_day, s.staff_user_id, s.staff_name,
          p_amount_cents, v_taken, cash.user_name(v_taken), coalesce(p_to_safe, false),
          case when v_self then 'accepted' else 'pending' end,
          case when v_self then p_amount_cents end, case when v_self then v_uid end,
          case when v_self then v_name end, case when v_self then now() end,
          case when v_self then 'app' end, false)
  returning * into r;
  perform cash.record_remittance_activity(r, 'cash.remitted', 'remitted');
  return jsonb_build_object('movementId', v_movement, 'remittanceId', r.id, 'status', r.status);
end;
$$;
revoke all on function public.record_cash_pickup(uuid, bigint, uuid, boolean, text) from public, anon;
grant execute on function public.record_cash_pickup(uuid, bigint, uuid, boolean, text) to authenticated;

-- ============================================
-- Transitions (CAS on status; P0002 when it already moved)
-- ============================================
-- Who may receive this remittance: cash_manage reaching its branch, and not
-- the cashier who handed it over — unless that cashier is the owner
-- (is_self_received).
create or replace function cash.receive_check(r public.cash_remittances, p_receiver uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner boolean := exists (select 1 from public.app_users au
                              where au.user_id = p_receiver and au.tenant_id = r.tenant_id and au.is_owner is true);
begin
  if not cash.user_manages_cash(p_receiver, r.tenant_id, r.outlet_id) then
    raise exception 'Only someone who handles cash at this branch can receive it.' using errcode = '42501';
  end if;
  if r.cashier_user_id = p_receiver and not v_owner then
    raise exception 'You cannot receive your own hand-over.' using errcode = '42501';
  end if;
  return r.cashier_user_id = p_receiver;
end;
$$;
revoke all on function cash.receive_check(public.cash_remittances, uuid) from public, anon, authenticated;

create or replace function cash.accept(p_id uuid, p_receiver uuid, p_received_cents bigint, p_note text, p_method text)
returns public.cash_remittances
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.cash_remittances;
  v_self boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from public.cash_remittances where id = p_id;
  if not found then
    raise exception 'That hand-over was not found.' using errcode = 'P0002';
  end if;
  v_self := cash.receive_check(r, p_receiver);
  if p_received_cents is null or p_received_cents not between 0 and 10000000000 then
    raise exception 'The amount received is out of range.' using errcode = '22023';
  end if;
  if r.handed_over_cents is not null and p_received_cents <> r.handed_over_cents and v_note is null then
    raise exception 'note_required: say why the amount is different.' using errcode = '22023';
  end if;
  update public.cash_remittances x
     set status = 'accepted', received_cents = p_received_cents, received_by = p_receiver,
         received_by_name = cash.user_name(p_receiver), received_at = now(), accept_method = p_method,
         is_self_received = v_self, receiver_note = v_note
   where x.id = p_id and x.status = 'pending'
  returning * into r;
  if not found then
    raise exception 'remittance_not_pending: this hand-over was already handled.' using errcode = 'P0002';
  end if;
  perform cash.record_remittance_activity(r, 'cash.remittance_accepted', 'accepted',
    case when r.handed_over_cents is not null and r.received_cents <> r.handed_over_cents then array['remittance_discrepancy'] else '{}'::text[] end);
  return r;
end;
$$;
revoke all on function cash.accept(uuid, uuid, bigint, text, text) from public, anon, authenticated;

create or replace function public.accept_remittance(p_id uuid, p_received_cents bigint, p_note text default null)
returns public.cash_remittances
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to receive cash.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cash_remittances r where r.id = p_id and public.app_user_may_reach_branch(r.tenant_id, r.outlet_id)) then
    raise exception 'That hand-over was not found.' using errcode = 'P0002';
  end if;
  return cash.accept(p_id, auth.uid(), p_received_cents, p_note, 'app');
end;
$$;
revoke all on function public.accept_remittance(uuid, bigint, text) from public, anon;
grant execute on function public.accept_remittance(uuid, bigint, text) to authenticated;

-- The PIN route (POST /api/cash/remittances/[id]/accept-pin) calls this with
-- the service role AFTER verify_staff_approval_pin succeeded for p_receiver.
create or replace function public.accept_remittance_as(p_id uuid, p_receiver uuid, p_received_cents bigint, p_note text default null)
returns public.cash_remittances
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_receiver is null then
    raise exception 'A receiver is required.' using errcode = '22023';
  end if;
  return cash.accept(p_id, p_receiver, p_received_cents, p_note, 'pin');
end;
$$;
revoke all on function public.accept_remittance_as(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.accept_remittance_as(uuid, uuid, bigint, text) to service_role;

create or replace function public.dispute_remittance(p_id uuid, p_reason text, p_received_cents bigint default null)
returns public.cash_remittances
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.cash_remittances;
  v_uid uuid := auth.uid();
begin
  select * into r from public.cash_remittances x where x.id = p_id;
  if v_uid is null or not found or not public.app_user_may_reach_branch(r.tenant_id, r.outlet_id) then
    raise exception 'That hand-over was not found.' using errcode = 'P0002';
  end if;
  perform cash.receive_check(r, v_uid);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required: say what is wrong with the hand-over.' using errcode = '22023';
  end if;
  if p_received_cents is not null and p_received_cents not between 0 and 10000000000 then
    raise exception 'The amount received is out of range.' using errcode = '22023';
  end if;
  update public.cash_remittances x
     set status = 'disputed', dispute_reason = btrim(p_reason), received_cents = p_received_cents,
         received_by = v_uid, received_by_name = cash.actor_name(), received_at = now(), accept_method = 'app'
   where x.id = p_id and x.status = 'pending'
  returning * into r;
  if not found then
    raise exception 'remittance_not_pending: this hand-over was already handled.' using errcode = 'P0002';
  end if;
  perform cash.record_remittance_activity(r, 'cash.remittance_disputed', 'disputed', array['remittance_discrepancy']);
  return r;
end;
$$;
revoke all on function public.dispute_remittance(uuid, text, bigint) from public, anon;
grant execute on function public.dispute_remittance(uuid, text, bigint) to authenticated;

create or replace function public.resolve_remittance(p_id uuid, p_note text)
returns public.cash_remittances
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.cash_remittances;
  v_uid uuid := auth.uid();
  v_owner boolean;
begin
  select * into r from public.cash_remittances x where x.id = p_id;
  if v_uid is null or not found or not public.app_user_may_reach_branch(r.tenant_id, r.outlet_id) then
    raise exception 'That hand-over was not found.' using errcode = 'P0002';
  end if;
  v_owner := exists (select 1 from public.app_users au where au.user_id = v_uid and au.tenant_id = r.tenant_id and au.is_owner is true);
  if not (v_owner or (cash.user_manages_cash(v_uid, r.tenant_id, r.outlet_id) and r.cashier_user_id is distinct from v_uid)) then
    raise exception 'Only the owner, or someone else who handles cash, can settle this.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'note_required: say how it was settled.' using errcode = '22023';
  end if;
  update public.cash_remittances x
     set status = 'resolved', resolved_by = v_uid, resolved_by_name = cash.actor_name(), resolved_at = now(),
         resolved_note = btrim(p_note)
   where x.id = p_id and x.status = 'disputed'
  returning * into r;
  if not found then
    raise exception 'remittance_not_disputed: only a disputed hand-over can be settled.' using errcode = 'P0002';
  end if;
  perform cash.record_remittance_activity(r, 'cash.remittance_resolved', 'resolved');
  return r;
end;
$$;
revoke all on function public.resolve_remittance(uuid, text) from public, anon;
grant execute on function public.resolve_remittance(uuid, text) to authenticated;

-- ============================================
-- list_cash_receivers
-- ============================================
-- The owner and every account holding cash_manage that reaches p_outlet
-- (p_outlet NULL = store-wide accounts only). is_on_shift = an open shift in
-- this store. last_seen_at = the latest of their shift opens/closes and their
-- own store activity in this store (indexed by tenant + actor), NULL if none.
-- has_pin = a "PIN here now" PIN is set for this store (never the hash).
create or replace function public.list_cash_receivers(p_tenant uuid, p_outlet uuid default null)
returns table (
  user_id uuid,
  name text,
  is_owner boolean,
  outlet_id uuid,
  is_on_shift boolean,
  last_seen_at timestamptz,
  has_pin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.app_user_belongs_to_store(p_tenant) then
    raise exception 'Only this store''s staff can see who receives cash.' using errcode = '42501';
  end if;
  return query
  select au.user_id,
         coalesce(cash.user_name(au.user_id), 'Staff'),
         coalesce(au.is_owner, false),
         au.outlet_id,
         exists (select 1 from public.staff_shifts s where s.tenant_id = p_tenant and s.staff_user_id = au.user_id and s.status = 'open'),
         greatest(
           (select max(greatest(s.opened_at, coalesce(s.closed_at, s.opened_at)))
              from (select x.opened_at, x.closed_at from public.staff_shifts x
                     where x.tenant_id = p_tenant and x.staff_user_id = au.user_id
                     order by x.opened_at desc limit 5) s),
           (select a.occurred_at from public.store_activity a
             where a.tenant_id = p_tenant and a.actor_user_id = au.user_id
             order by a.occurred_at desc limit 1)),
         exists (select 1 from public.staff_approval_pins p where p.tenant_id = p_tenant and p.user_id = au.user_id)
    from public.app_users au
   where au.role = 'admin' and au.tenant_id = p_tenant
     and cash.user_manages_cash(au.user_id, p_tenant, p_outlet)
     and (p_outlet is not null or au.outlet_id is null or au.is_owner is true)
   -- Owner first, then by name ignoring case — the same order on every collation.
   order by coalesce(au.is_owner, false) desc, lower(coalesce(cash.user_name(au.user_id), '')) collate "C", au.user_id;
end;
$$;
revoke all on function public.list_cash_receivers(uuid, uuid) from public, anon;
grant execute on function public.list_cash_receivers(uuid, uuid) to authenticated;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- drop function if exists public.list_cash_receivers(uuid, uuid), public.resolve_remittance(uuid, text),
--   public.dispute_remittance(uuid, text, bigint), public.accept_remittance_as(uuid, uuid, bigint, text),
--   public.accept_remittance(uuid, bigint, text), public.record_cash_pickup(uuid, bigint, uuid, boolean, text);
-- drop function if exists cash.accept(uuid, uuid, bigint, text, text), cash.receive_check(public.cash_remittances, uuid);
-- drop trigger if exists trg_staff_shift_remittance on public.staff_shifts;
-- drop function if exists cash.create_shift_remittance(), cash.record_remittance_activity(public.cash_remittances, text, text, text[]);
-- drop table if exists public.cash_remittances;
-- alter table public.shift_cash_movements drop column if exists taken_by, drop column if exists taken_by_name, drop column if exists to_safe;
-- drop function if exists cash.user_name(uuid), cash.user_manages_cash(uuid, uuid, uuid), public.app_user_has_permission_of(uuid, uuid, text);
