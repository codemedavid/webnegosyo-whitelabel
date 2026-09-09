-- supabase/migrations/20260905140000_loyalty_programs.sql
--
-- Account-free loyalty: versioned programs, an append-only earning ledger,
-- customer balances and issued rewards.
--
-- What a customer is rewarded for is a QUALIFIED order — the same definition
-- the Customer Hub uses (a POS sale at settlement, an online order at
-- delivery/collection). Every program a customer is eligible for earns on the
-- same order; a customer redeems one reward per sale. Nothing here has an
-- account or a password: the customer is their normalized phone (or email),
-- the `customer_key` that voucher_redemptions already uses.
--
-- Eight tables:
--   loyalty_programs          — the merchant's program (name, mode, scope, state)
--   loyalty_program_versions  — IMMUTABLE rule snapshots; a live edit is a new row
--   loyalty_balances          — one row per (program, customer): stamps or points
--   loyalty_ledger            — append-only; every earn, reversal, redemption, correction
--   loyalty_entitlements      — rewards issued when a balance crosses the threshold
--   loyalty_reservations      — a reward held for a sale in progress (redemption follow-up)
--   loyalty_otp_challenges    — SMS verification for claims (redemption follow-up)
--   loyalty_sms_outbox        — device-claimed OTP delivery jobs (redemption follow-up)
--
-- The last three are created EMPTY now so the earning code is written against
-- the final shape and the redemption follow-up adds no migration to earning.
--
-- Where correctness lives: the UNIQUE index on
-- (program_id, order_backend, external_order_id, kind) is the duplicate-
-- earning defence. Lifecycle events arrive from three backends over merchant
-- handsets with retries; the constraint, not application code, guarantees a
-- replayed "delivered" cannot stamp a card twice. Same lesson as
-- redeem_voucher: put the invariant in the database.
--
-- `external_order_id` is TEXT, not a uuid FK, for the reason
-- voucher_redemptions.order_id is: some tenants' orders live in Convex, whose
-- ids are not uuids.
--
-- Safety / reversibility: purely additive — eight new tables, one function, two
-- defaulted tenant columns. No existing column changes type and no row data is
-- modified. Safe to apply online and ahead of any deploy. Rollback at the bottom.
--
-- Access model: the same shape as `vouchers` — the owning tenant's admins plus
-- superadmin, comparing `au.tenant_id` to THE ROW's tenant_id (table-qualified).
-- No anon policy anywhere: public phone lookup, when it is built, goes through
-- the server, which returns progress and rewards only.

-- 1. Programs ---------------------------------------------------------------------
create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  name text not null,
  description text,

  -- 'stamp': one stamp per qualified order. 'points': points per peso spent.
  earn_mode text not null check (earn_mode in ('stamp', 'points')),

  -- 'business' earns at every branch; 'branch' only at outlet_id.
  scope text not null default 'business' check (scope in ('business', 'branch')),
  outlet_id uuid references public.outlets(id) on delete set null,

  -- draft → active → paused ⇄ active → ended. Ended is terminal.
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),

  -- Orders completed BEFORE activates_at never earn: existing orders are never
  -- granted retroactive credit, whatever the rules say.
  activates_at timestamptz,
  ends_at timestamptz,

  -- The version whose rules earn today. FK added after the versions table.
  current_version_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  constraint loyalty_programs_window_ordered
    check (ends_at is null or activates_at is null or ends_at >= activates_at),
  constraint loyalty_programs_branch_scope_needs_outlet
    check (scope <> 'branch' or outlet_id is not null)
);

create index if not exists loyalty_programs_tenant_status_idx
  on public.loyalty_programs(tenant_id, status);

drop trigger if exists loyalty_programs_set_updated_at on public.loyalty_programs;
create trigger loyalty_programs_set_updated_at
  before update on public.loyalty_programs
  for each row execute function set_updated_at();

-- 2. Versions ---------------------------------------------------------------------
-- A program's rules are never edited in place. Changing them writes a new
-- version and points current_version_id at it; the ledger and every issued
-- reward keep the version they were made under, so a customer three stamps
-- from a free coffee cannot wake up four stamps away.
create table if not exists public.loyalty_program_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  version integer not null check (version >= 1),

  -- Validated by src/lib/loyalty/rules.ts (parseLoyaltyRules). Shape:
  -- { earnMode, threshold, pointsPerPeso?, minSpend?, reward, rewardExpiryDays?, isExclusive }
  -- reward: {type:'fixed', amount} | {type:'percent', percent, maxAmount?}
  --       | {type:'free_item', menuItemId, itemName}
  rules jsonb not null,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  constraint loyalty_program_versions_program_version_uq unique (program_id, version)
);

create index if not exists loyalty_program_versions_program_idx
  on public.loyalty_program_versions(program_id, version desc);

alter table public.loyalty_programs
  drop constraint if exists loyalty_programs_current_version_fk;
alter table public.loyalty_programs
  add constraint loyalty_programs_current_version_fk
  foreign key (current_version_id) references public.loyalty_program_versions(id)
  on delete set null;

-- Immutability is enforced by the database, not by convention: an UPDATE or
-- DELETE on a version row is refused outright, even under service role.
create or replace function public.loyalty_program_versions_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'loyalty_program_versions is immutable: write a new version instead'
    using errcode = 'integrity_constraint_violation';
end;
$$;

drop trigger if exists trg_loyalty_program_versions_immutable on public.loyalty_program_versions;
create trigger trg_loyalty_program_versions_immutable
  before update or delete on public.loyalty_program_versions
  for each row execute function public.loyalty_program_versions_immutable();

-- 3. Balances ---------------------------------------------------------------------
-- The customer's current stamps or points in ONE program. Maintained only by
-- apply_loyalty_earning below; the ledger is the truth, this is the index.
-- May go negative: a reversal after a reward was issued is a real debt the
-- next earning pays down, not an error to hide.
create table if not exists public.loyalty_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,

  -- `phone:+639…` or `email:…` from resolveCustomerIdentity. Same key as
  -- voucher_redemptions.customer_key, so the two features agree on who a
  -- customer is.
  customer_key text not null,
  -- Set when the customer has a profile row; null keeps the balance readable
  -- even if the profile is merged or deleted.
  customer_id uuid references public.customers(id) on delete set null,

  balance numeric(12,2) not null default 0,
  lifetime_earned numeric(12,2) not null default 0,
  rewards_issued integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint loyalty_balances_program_customer_uq unique (program_id, customer_key)
);

create index if not exists loyalty_balances_tenant_customer_idx
  on public.loyalty_balances(tenant_id, customer_key);

-- 4. Ledger -----------------------------------------------------------------------
-- Append-only. Never updated, never deleted: a mistake is corrected by another
-- row with kind = 'correction' and a note, so the audit trail shows both.
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  -- The rules this entry was computed under.
  version_id uuid references public.loyalty_program_versions(id) on delete set null,
  customer_key text not null,

  kind text not null check (kind in ('earn', 'reverse', 'redeem', 'correction')),
  -- Stamps or points. Positive for earn, negative for reverse/redeem, either for
  -- a correction.
  delta numeric(12,2) not null,

  -- The order this entry answers to; null only for a manual correction.
  order_backend text check (order_backend in ('platform_supabase', 'convex', 'tenant_supabase')),
  external_order_id text,

  -- Written while the tenant is in shadow mode: recorded for reconciliation,
  -- excluded from balances, and NEVER promoted to real credit later.
  is_shadow boolean not null default false,

  actor uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),

  constraint loyalty_ledger_order_ref_complete
    check ((order_backend is null) = (external_order_id is null)),
  constraint loyalty_ledger_correction_needs_note
    check (kind <> 'correction' or (note is not null and length(trim(note)) > 0))
);

-- THE duplicate-earning defence. One earn, one reversal, one redemption per
-- (program, order). Partial: manual corrections carry no order and are not
-- deduplicated — a second correction with a note is a legitimate second entry.
create unique index if not exists loyalty_ledger_program_order_kind_uq
  on public.loyalty_ledger(program_id, order_backend, external_order_id, kind)
  where external_order_id is not null;

create index if not exists loyalty_ledger_program_customer_idx
  on public.loyalty_ledger(program_id, customer_key, created_at desc);

create index if not exists loyalty_ledger_tenant_created_idx
  on public.loyalty_ledger(tenant_id, created_at desc);

-- 5. Entitlements -----------------------------------------------------------------
-- A reward the customer has earned and may claim. `terms` is a SNAPSHOT of the
-- version's reward at issue time, so a later rule change cannot alter what was
-- promised. Status walk: issued → reserved → consumed; issued → expired;
-- consumed → restored (full refund); issued → voided (earning reversed).
create table if not exists public.loyalty_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  version_id uuid references public.loyalty_program_versions(id) on delete set null,
  customer_key text not null,
  -- The earn entry whose threshold crossing issued this reward.
  source_ledger_id uuid references public.loyalty_ledger(id) on delete set null,

  terms jsonb not null,
  status text not null default 'issued'
    check (status in ('issued', 'reserved', 'consumed', 'expired', 'restored', 'voided')),

  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  consumed_at timestamptz,
  consumed_order_backend text
    check (consumed_order_backend is null or consumed_order_backend in ('platform_supabase', 'convex', 'tenant_supabase')),
  consumed_order_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyalty_entitlements_customer_status_idx
  on public.loyalty_entitlements(tenant_id, customer_key, status);

create index if not exists loyalty_entitlements_program_idx
  on public.loyalty_entitlements(program_id, status);

drop trigger if exists loyalty_entitlements_set_updated_at on public.loyalty_entitlements;
create trigger loyalty_entitlements_set_updated_at
  before update on public.loyalty_entitlements
  for each row execute function set_updated_at();

-- 6. Redemption tables (follow-up; created empty) --------------------------------
-- A reward held for the sale in progress. `token_hash` is the keyed hash of the
-- signed QR reference; the payload itself carries no PII.
create table if not exists public.loyalty_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entitlement_id uuid not null references public.loyalty_entitlements(id) on delete cascade,
  token_hash text not null,
  status text not null default 'held' check (status in ('held', 'consumed', 'released', 'expired')),
  order_backend text check (order_backend is null or order_backend in ('platform_supabase', 'convex', 'tenant_supabase')),
  external_order_id text,
  outlet_id uuid references public.outlets(id) on delete set null,
  reserved_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists loyalty_reservations_token_uq
  on public.loyalty_reservations(token_hash);

-- One live hold per reward: a second scan while the first is still held fails
-- at the index, not in application code.
create unique index if not exists loyalty_reservations_live_entitlement_uq
  on public.loyalty_reservations(entitlement_id)
  where status = 'held';

drop trigger if exists loyalty_reservations_set_updated_at on public.loyalty_reservations;
create trigger loyalty_reservations_set_updated_at
  before update on public.loyalty_reservations
  for each row execute function set_updated_at();

-- SMS verification for a claim. Keyed hashes only: neither the phone nor the
-- code is stored in clear.
create table if not exists public.loyalty_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_hash text not null,
  code_hash text not null,
  purpose text not null default 'claim' check (purpose in ('claim')),
  entitlement_id uuid references public.loyalty_entitlements(id) on delete cascade,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_otp_challenges_phone_idx
  on public.loyalty_otp_challenges(tenant_id, phone_hash, created_at desc);

-- Device-claimed delivery jobs, on the sms_campaign_runs pattern: a job is
-- claimed with a conditional update (`claimed_by_device is null`) so two
-- handsets cannot both send the same code.
create table if not exists public.loyalty_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  challenge_id uuid not null references public.loyalty_otp_challenges(id) on delete cascade,
  transport text not null default 'android_sim' check (transport in ('android_sim', 'semaphore')),
  -- Encrypted at rest by the server; the handset decrypts only what it claimed.
  payload_encrypted text not null,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'sent', 'failed')),
  claimed_by_device text,
  claimed_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyalty_sms_outbox_tenant_status_idx
  on public.loyalty_sms_outbox(tenant_id, status, created_at);

drop trigger if exists loyalty_sms_outbox_set_updated_at on public.loyalty_sms_outbox;
create trigger loyalty_sms_outbox_set_updated_at
  before update on public.loyalty_sms_outbox
  for each row execute function set_updated_at();

-- 7. Atomic earning ---------------------------------------------------------------
-- The only sanctioned way to write the ledger and move a balance. One
-- transaction: ledger row → balance → threshold crossings → entitlements.
--
-- Idempotent at the unique index: a replayed (program, order, kind) inserts
-- nothing and returns {applied:false, reason:'duplicate'} — the caller learns
-- it was a replay without ever reading first.
--
-- Concurrency: the balance upsert's ON CONFLICT DO UPDATE takes the row lock,
-- so two earns for the same customer serialise and each sees the other's
-- delta before deciding how many rewards to issue. No read-then-write.
--
-- Shadow: when p_shadow is true the ledger row is written with is_shadow and
-- NOTHING else moves. Shadow rows exist to be reconciled, never promoted.
--
-- Threshold carry-over: crossing 10 with 12 leaves 2 on the card, and
-- crossing it twice at once issues two rewards. The while loop is the rule.
--
-- Reversal: kind='reverse' moves the balance by p_delta (negative) and voids
-- any still-unclaimed reward this order's earn issued, so a cancelled order
-- cannot leave a free coffee behind. A reward already consumed is not clawed
-- back here — that is a refund decision for the redemption follow-up.
create or replace function public.apply_loyalty_earning(
  p_tenant_id uuid,
  p_program_id uuid,
  p_version_id uuid,
  p_customer_key text,
  p_customer_id uuid,
  p_kind text,
  p_delta numeric,
  p_order_backend text,
  p_external_order_id text,
  p_threshold numeric,
  p_reward_terms jsonb,
  p_reward_expires_at timestamptz,
  p_shadow boolean,
  p_actor uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id uuid;
  v_balance numeric;
  v_issued integer := 0;
  v_earn_ledger_id uuid;
begin
  if p_customer_key is null or length(trim(p_customer_key)) = 0 then
    raise exception 'apply_loyalty_earning: customer_key is required';
  end if;

  -- The program must belong to the tenant named, or a caller could move a
  -- balance in another store's program by guessing its id.
  if not exists (
    select 1 from public.loyalty_programs
     where id = p_program_id and tenant_id = p_tenant_id
  ) then
    raise exception 'apply_loyalty_earning: program % does not belong to tenant %', p_program_id, p_tenant_id;
  end if;

  insert into public.loyalty_ledger (
    tenant_id, program_id, version_id, customer_key, kind, delta,
    order_backend, external_order_id, is_shadow, actor, note
  ) values (
    p_tenant_id, p_program_id, p_version_id, p_customer_key, p_kind, p_delta,
    p_order_backend, p_external_order_id, coalesce(p_shadow, false), p_actor, p_note
  )
  on conflict (program_id, order_backend, external_order_id, kind)
    where external_order_id is not null
  do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return jsonb_build_object('applied', false, 'reason', 'duplicate');
  end if;

  if coalesce(p_shadow, false) then
    return jsonb_build_object('applied', true, 'shadow', true, 'ledgerId', v_ledger_id);
  end if;

  insert into public.loyalty_balances (tenant_id, program_id, customer_key, customer_id, balance, lifetime_earned)
  values (p_tenant_id, p_program_id, p_customer_key, p_customer_id, p_delta, greatest(p_delta, 0))
  on conflict (program_id, customer_key) do update
    set balance = public.loyalty_balances.balance + excluded.balance,
        lifetime_earned = public.loyalty_balances.lifetime_earned + excluded.lifetime_earned,
        customer_id = coalesce(public.loyalty_balances.customer_id, excluded.customer_id),
        updated_at = now()
  returning balance into v_balance;

  if p_kind = 'earn' and p_threshold is not null and p_threshold > 0 then
    while v_balance >= p_threshold loop
      v_balance := v_balance - p_threshold;
      v_issued := v_issued + 1;
      insert into public.loyalty_entitlements (
        tenant_id, program_id, version_id, customer_key, source_ledger_id, terms, expires_at
      ) values (
        p_tenant_id, p_program_id, p_version_id, p_customer_key, v_ledger_id,
        coalesce(p_reward_terms, '{}'::jsonb), p_reward_expires_at
      );
    end loop;

    if v_issued > 0 then
      update public.loyalty_balances
         set balance = v_balance,
             rewards_issued = rewards_issued + v_issued,
             updated_at = now()
       where program_id = p_program_id and customer_key = p_customer_key;
    end if;
  end if;

  if p_kind = 'reverse' and p_external_order_id is not null then
    select id into v_earn_ledger_id
      from public.loyalty_ledger
     where program_id = p_program_id
       and order_backend = p_order_backend
       and external_order_id = p_external_order_id
       and kind = 'earn';

    if v_earn_ledger_id is not null then
      update public.loyalty_entitlements
         set status = 'voided', updated_at = now()
       where source_ledger_id = v_earn_ledger_id
         and status = 'issued';
    end if;
  end if;

  return jsonb_build_object(
    'applied', true,
    'shadow', false,
    'ledgerId', v_ledger_id,
    'balance', v_balance,
    'entitlementsIssued', v_issued
  );
end;
$$;

-- 8. Tenant flags -----------------------------------------------------------------
-- loyalty_enabled: earning runs at all. loyalty_shadow: earning writes shadow
-- ledger rows only, so a rules bug is caught by reconciliation before any
-- customer sees a reward. Both default off; nothing changes for any tenant.
alter table public.tenants
  add column if not exists loyalty_enabled boolean not null default false;
alter table public.tenants
  add column if not exists loyalty_shadow boolean not null default true;

comment on column public.tenants.loyalty_enabled is
  'Runs loyalty earning on qualified orders. Defaults false; a pilot switch flipped per store.';
comment on column public.tenants.loyalty_shadow is
  'While true, loyalty earning writes shadow ledger rows only — no balances, no rewards. Defaults TRUE so a newly enabled store starts in shadow and is reconciled before going live.';

-- 9. RLS --------------------------------------------------------------------------
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_program_versions enable row level security;
alter table public.loyalty_balances enable row level security;
alter table public.loyalty_ledger enable row level security;
alter table public.loyalty_entitlements enable row level security;
alter table public.loyalty_reservations enable row level security;
alter table public.loyalty_otp_challenges enable row level security;
alter table public.loyalty_sms_outbox enable row level security;

-- Programs and versions are merchant configuration: the tenant's admins manage
-- them directly.
drop policy if exists loyalty_programs_tenant_access on public.loyalty_programs;
create policy loyalty_programs_tenant_access on public.loyalty_programs
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
                  and (au.role = 'superadmin' or au.tenant_id = loyalty_programs.tenant_id)))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid()
                  and (au.role = 'superadmin' or au.tenant_id = loyalty_programs.tenant_id)));

drop policy if exists loyalty_program_versions_tenant_select on public.loyalty_program_versions;
create policy loyalty_program_versions_tenant_select on public.loyalty_program_versions
  for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
                  and (au.role = 'superadmin' or au.tenant_id = loyalty_program_versions.tenant_id)));

drop policy if exists loyalty_program_versions_tenant_insert on public.loyalty_program_versions;
create policy loyalty_program_versions_tenant_insert on public.loyalty_program_versions
  for insert
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid()
                  and (au.role = 'superadmin' or au.tenant_id = loyalty_program_versions.tenant_id)));

-- Balances, the ledger and entitlements are READ-ONLY to admins: every write
-- goes through apply_loyalty_earning under service role, so a balance can
-- never be edited without a ledger row explaining it.
drop policy if exists loyalty_balances_tenant_select on public.loyalty_balances;
create policy loyalty_balances_tenant_select on public.loyalty_balances
  for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
                  and (au.role = 'superadmin' or au.tenant_id = loyalty_balances.tenant_id)));

drop policy if exists loyalty_ledger_tenant_select on public.loyalty_ledger;
create policy loyalty_ledger_tenant_select on public.loyalty_ledger
  for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
                  and (au.role = 'superadmin' or au.tenant_id = loyalty_ledger.tenant_id)));

drop policy if exists loyalty_entitlements_tenant_select on public.loyalty_entitlements;
create policy loyalty_entitlements_tenant_select on public.loyalty_entitlements
  for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
                  and (au.role = 'superadmin' or au.tenant_id = loyalty_entitlements.tenant_id)));

drop policy if exists loyalty_reservations_tenant_select on public.loyalty_reservations;
create policy loyalty_reservations_tenant_select on public.loyalty_reservations
  for select
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid()
                  and (au.role = 'superadmin' or au.tenant_id = loyalty_reservations.tenant_id)));

-- OTP challenges and the outbox hold hashed PII and encrypted codes. Not even
-- the tenant's admins read them; only the server (service role) and, for the
-- outbox, the device-claim RPC the follow-up adds. No policies = no access.

-- 10. Lock the RPCs down ----------------------------------------------------------
-- apply_loyalty_earning is SECURITY DEFINER and PostgREST publishes every public
-- function as an RPC. Left as created, an anonymous caller could stamp any
-- customer's card in any program. Only the server earns.
revoke all on function public.apply_loyalty_earning(uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_loyalty_earning(uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text)
  to service_role;

-- Trigger function: fires with the table owner's rights; no business as an RPC.
revoke all on function public.loyalty_program_versions_immutable() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   drop function if exists public.apply_loyalty_earning(uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text);
--   drop table if exists public.loyalty_sms_outbox;
--   drop table if exists public.loyalty_otp_challenges;
--   drop table if exists public.loyalty_reservations;
--   drop table if exists public.loyalty_entitlements;
--   drop table if exists public.loyalty_ledger;
--   drop table if exists public.loyalty_balances;
--   alter table public.loyalty_programs drop constraint if exists loyalty_programs_current_version_fk;
--   drop trigger if exists trg_loyalty_program_versions_immutable on public.loyalty_program_versions;
--   drop function if exists public.loyalty_program_versions_immutable();
--   drop table if exists public.loyalty_program_versions;
--   drop table if exists public.loyalty_programs;
--   alter table public.tenants drop column if exists loyalty_enabled, drop column if exists loyalty_shadow;
-- ------------------------------------------------------------------------------
