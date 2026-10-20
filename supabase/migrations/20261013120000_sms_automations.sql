-- SMS automations: recipes an owner switches on, store-wide texting rules,
-- and a generic outbox the store's Android phone drains in the background.
-- See docs/plans/2026-10-12-sms-automations.md.
--
-- 1. The SERVER decides who gets a text (cron tick or "Run now") and inserts
--    rows here with the service role. A phone only claims and sends.
-- 2. Dedupe is the database's job: ONE row per (store, recipe family, guest,
--    occurrence) ever — win-back and "regulars gone quiet" share the `lapse`
--    family, so a guest's absence is answered once, by whichever came first.
--    (Stricter than the plan's per-automation key, on purpose.)
-- 3. A text can wait hours for a phone, so the claim re-checks everything that
--    can change meanwhile: consent, opt-out, suppression, the guest's phone,
--    "they ordered since" (exit), "the reward was used" (entitlement), quiet
--    hours, the store's daily limit, the per-guest cap (automated texts AND
--    campaign sends), and Android's ~30 texts / 30 min per phone (paced at 25).
-- 4. Delivery is AT MOST ONCE: the claim itself starts dispatch and hands out
--    the body. A phone that never reports back leaves the row `claimed`; after
--    15 minutes the sweep fails it as `unconfirmed` and it is never re-sent.
--    A late "sent" report still corrects it.
-- 5. Phones authenticate with the existing gateway enrollment
--    (loyalty_sms_devices), but marketing claims need the `customers`
--    permission and NOT loyalty_enabled.
--
-- Purely additive: three tables, five functions. Rollback at the bottom.

-- ---------------------------------------------------------------------------
-- Automations
-- ---------------------------------------------------------------------------
create table public.sms_automations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  recipe text not null check (recipe in ('review_request','first_visit_followup','loyalty_almost_there',
    'loyalty_reward_waiting','loyalty_reward_expiring','win_back','regulars_gone_quiet')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params)='object'),
  message_template text not null check (char_length(btrim(message_template)) between 1 and 459),
  run_mode text not null default 'auto' check (run_mode in ('auto','manual')),
  reentry_days integer check (reentry_days is null or reentry_days between 1 and 365),
  status text not null default 'off' check (status in ('on','off')),
  source text not null default 'owner' check (source in ('owner','ai','onboarding')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_automations_one_per_recipe unique (tenant_id, recipe)
);
create index sms_automations_on_idx on public.sms_automations(tenant_id) where status='on';
create trigger sms_automations_set_updated_at before update on public.sms_automations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Texting rules (one row per store; the claim creates it with the defaults)
-- ---------------------------------------------------------------------------
create table public.sms_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  quiet_hours_start text not null default '21:00' check (quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_hours_end text not null default '08:00' check (quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  guest_cap_days integer not null default 3 check (guest_cap_days between 1 and 30),
  daily_limit integer not null default 100 check (daily_limit between 1 and 500),
  -- Off until a STOP reply really opts the guest out (plan phase 5).
  opt_out_line text check (opt_out_line is null or char_length(btrim(opt_out_line)) between 1 and 60),
  review_url text check (review_url is null or (review_url ~ '^https://[^[:space:]]+$' and char_length(review_url)<=300)),
  updated_at timestamptz not null default now()
);
create trigger sms_settings_set_updated_at before update on public.sms_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  automation_id uuid references public.sms_automations(id) on delete set null,
  recipe text not null check (recipe in ('review_request','first_visit_followup','loyalty_almost_there',
    'loyalty_reward_waiting','loyalty_reward_expiring','win_back','regulars_gone_quiet')),
  family text not null check (family ~ '^[a-z_]{1,40}$'),
  customer_id uuid not null references public.customers(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  body text not null check (char_length(body) between 1 and 1000),
  occurrence_key text not null check (char_length(occurrence_key) between 1 and 200),
  priority smallint not null check (priority between 1 and 99),
  source text not null check (source in ('auto','run_now')),
  status text not null default 'queued'
    check (status in ('queued','claimed','sent','failed','cancelled','expired','skipped')),
  not_before timestamptz not null,
  expires_at timestamptz not null,
  exit_if_ordered_after timestamptz,
  entitlement_id uuid references public.loyalty_entitlements(id) on delete set null,
  claimed_by_device uuid,
  claimed_by_actor uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  lease_token uuid,
  dispatch_started_at timestamptz,
  sent_at timestamptz,
  skip_reason text check (skip_reason is null or skip_reason ~ '^[a-z_]{1,40}$'),
  error text check (error is null or error ~ '^[a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_outbox_one_per_occurrence unique (tenant_id, family, customer_id, occurrence_key)
);
create index sms_outbox_queue_idx on public.sms_outbox(tenant_id, priority, not_before, created_at)
  where status='queued';
create index sms_outbox_claimed_idx on public.sms_outbox(tenant_id, dispatch_started_at)
  where status='claimed';
create index sms_outbox_dispatch_idx on public.sms_outbox(tenant_id, dispatch_started_at)
  where dispatch_started_at is not null;
create index sms_outbox_device_dispatch_idx on public.sms_outbox(claimed_by_device, dispatch_started_at)
  where claimed_by_device is not null;
create index sms_outbox_phone_idx on public.sms_outbox(tenant_id, phone_e164, created_at desc);
create index sms_outbox_history_idx on public.sms_outbox(tenant_id, created_at desc);
create index sms_outbox_customer_idx on public.sms_outbox(customer_id);
create index sms_outbox_automation_idx on public.sms_outbox(automation_id) where automation_id is not null;
create index sms_outbox_entitlement_idx on public.sms_outbox(entitlement_id) where entitlement_id is not null;
create trigger sms_outbox_set_updated_at before update on public.sms_outbox
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access: staff with `customers` READ; every write is the service role
-- (bearer API routes after their own permission check) or a definer RPC.
-- ---------------------------------------------------------------------------
alter table public.sms_automations enable row level security;
alter table public.sms_settings enable row level security;
alter table public.sms_outbox enable row level security;
revoke all on public.sms_automations, public.sms_settings, public.sms_outbox from public, anon, authenticated;
grant select on public.sms_automations, public.sms_settings, public.sms_outbox to authenticated;
grant select, insert, update, delete on public.sms_automations, public.sms_settings, public.sms_outbox to service_role;
create policy sms_automations_staff_select on public.sms_automations for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_settings_staff_select on public.sms_settings for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_outbox_staff_select on public.sms_outbox for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Same enrolled phone as the loyalty gateway; marketing needs `customers`, not loyalty.
create function public.sms_outbox_delivery_allowed(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  if current_setting('transaction_isolation')<>'read committed' or p_tenant_id is null
    or p_device_id is null or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$' then
    return false; end if;
  perform 1 from public.loyalty_sms_devices where device_id=p_device_id and tenant_id=p_tenant_id
    and actor_id=p_actor_id and credential_hash=p_credential_hash and enabled is true for share;
  if not found then return false; end if;
  perform 1 from public.app_users where user_id=p_actor_id
    and (role='superadmin' or (role='admin' and tenant_id=p_tenant_id
      and (is_owner is true or permissions is null or 'customers'=any(permissions)))) for share;
  return found;
end;
$$;
revoke all on function public.sms_outbox_delivery_allowed(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

-- Quiet hours are Manila wall-clock "HH:MM"; equal start/end = never quiet.
create function public.sms_is_quiet_at(p_at timestamptz,p_start text,p_end text)
returns boolean language sql stable set search_path=public as $$
  with t as (select (p_at at time zone 'Asia/Manila')::time as local, p_start::time as s, p_end::time as e)
  select case when s=e then false
    when s<e then local>=s and local<e
    else local>=s or local<e end
  from t;
$$;
revoke all on function public.sms_is_quiet_at(timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.sms_is_quiet_at(timestamptz,text,text) to service_role;

-- Expire queued texts past their moment; fail dispatched texts no phone confirmed.
create function public.sweep_sms_outbox(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  expired_count integer;
  unconfirmed_count integer;
begin
  update public.sms_outbox set status='expired',skip_reason='expired'
    where tenant_id=p_tenant_id and status='queued' and expires_at<=clock_timestamp();
  get diagnostics expired_count=row_count;
  update public.sms_outbox set status='failed',error='unconfirmed'
    where tenant_id=p_tenant_id and status='claimed'
      and dispatch_started_at<=clock_timestamp()-interval '15 minutes';
  get diagnostics unconfirmed_count=row_count;
  return jsonb_build_object('ok',true,'expired',expired_count,'unconfirmed',unconfirmed_count);
end;
$$;
revoke all on function public.sweep_sms_outbox(uuid) from public,anon,authenticated;
grant execute on function public.sweep_sms_outbox(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Claim: the phone asks for its next text. Returns the body exactly once.
-- ---------------------------------------------------------------------------
create function public.claim_sms_outbox_message(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  rules public.sms_settings%rowtype;
  msg public.sms_outbox%rowtype;
  guest public.customers%rowtype;
  candidate record;
  now_at timestamptz;
  day_start timestamptz;
  sent_today integer;
  recent_count integer;
  oldest_recent timestamptz;
  last_contact timestamptz;
  next_at timestamptz;
  reason text;
  outcome text;
begin
  if not public.sms_outbox_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash) then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  -- One claim at a time per store: the daily limit and the per-guest cap are store-wide.
  perform pg_advisory_xact_lock(18705,hashtext(p_tenant_id::text));
  insert into public.loyalty_sms_device_heartbeats as h(device_id,tenant_id,last_seen_at)
    values(p_device_id,p_tenant_id,clock_timestamp())
    on conflict (device_id) do update set last_seen_at=excluded.last_seen_at,tenant_id=excluded.tenant_id
    where h.last_seen_at<clock_timestamp()-interval '10 seconds';
  perform public.sweep_sms_outbox(p_tenant_id);

  insert into public.sms_settings(tenant_id) values(p_tenant_id) on conflict do nothing;
  select * into rules from public.sms_settings where tenant_id=p_tenant_id;
  now_at:=clock_timestamp();

  if public.sms_is_quiet_at(now_at,rules.quiet_hours_start,rules.quiet_hours_end) then
    return jsonb_build_object('ok',false,'error','quiet_hours'); end if;

  day_start:=date_trunc('day',now_at at time zone 'Asia/Manila') at time zone 'Asia/Manila';
  select count(*) into sent_today from public.sms_outbox
    where tenant_id=p_tenant_id and dispatch_started_at>=day_start;
  if sent_today>=rules.daily_limit then
    return jsonb_build_object('ok',false,'error','daily_limit','retryAt',day_start+interval '1 day'); end if;

  select count(*),min(dispatch_started_at) into recent_count,oldest_recent from public.sms_outbox
    where claimed_by_device=p_device_id and dispatch_started_at>now_at-interval '30 minutes';
  if recent_count>=25 then
    return jsonb_build_object('ok',false,'error','paced','retryAt',oldest_recent+interval '30 minutes'); end if;

  for candidate in select o.id from public.sms_outbox o
    where o.tenant_id=p_tenant_id and o.status='queued' and o.not_before<=now_at and o.expires_at>now_at
    order by o.priority,o.not_before,o.created_at,o.id limit 25
  loop
    select * into msg from public.sms_outbox where id=candidate.id and status='queued' for update skip locked;
    if not found then continue; end if;
    reason:=null;
    outcome:='skipped';
    select * into guest from public.customers where id=msg.customer_id and tenant_id=p_tenant_id;
    if not found or guest.phone_e164 is distinct from msg.phone_e164 then reason:='guest_changed';
    elsif guest.sms_consent is not true then reason:='no_consent';
    elsif guest.sms_opt_out is true then reason:='opted_out';
    elsif exists(select 1 from public.sms_suppressions s
        where s.tenant_id=p_tenant_id and s.phone_e164=msg.phone_e164) then reason:='suppressed';
    elsif msg.exit_if_ordered_after is not null and guest.last_order_at>msg.exit_if_ordered_after then
      reason:='ordered'; outcome:='cancelled';
    elsif msg.entitlement_id is not null and not exists(select 1 from public.loyalty_entitlements e
        where e.id=msg.entitlement_id and e.tenant_id=p_tenant_id and e.status in ('issued','restored')
          and (e.expires_at is null or e.expires_at>now_at)) then
      reason:='reward_used'; outcome:='cancelled';
    end if;
    if reason is not null then
      update public.sms_outbox set status=outcome,skip_reason=reason where id=msg.id;
      continue;
    end if;

    -- Per-guest cap across automated texts AND campaign sends: hold, never drop.
    select max(t) into last_contact from (
      select coalesce(o.sent_at,o.dispatch_started_at) as t from public.sms_outbox o
        where o.tenant_id=p_tenant_id and o.phone_e164=msg.phone_e164 and o.id<>msg.id
          and (o.status='claimed' or (o.status='sent' and o.sent_at>now_at-make_interval(days=>rules.guest_cap_days)))
      union all
      select s.sent_at from public.sms_sends s
        where s.tenant_id=p_tenant_id and s.phone_e164=msg.phone_e164 and s.result='sent'
          and s.sent_at>now_at-make_interval(days=>rules.guest_cap_days)
    ) recent;
    if last_contact is not null then
      update public.sms_outbox set not_before=greatest(last_contact+make_interval(days=>rules.guest_cap_days),now_at+interval '1 hour')
        where id=msg.id;
      continue;
    end if;

    update public.sms_outbox set status='claimed',claimed_by_device=p_device_id,claimed_by_actor=p_actor_id,
      claimed_at=now_at,dispatch_started_at=now_at,lease_token=gen_random_uuid(),skip_reason=null,error=null
      where id=msg.id returning * into msg;
    return jsonb_build_object('ok',true,'messageId',msg.id,'leaseToken',msg.lease_token,
      'phone',msg.phone_e164,'body',msg.body);
  end loop;

  select min(not_before) into next_at from public.sms_outbox
    where tenant_id=p_tenant_id and status='queued' and expires_at>now_at;
  return jsonb_build_object('ok',false,'error','no_job','nextAt',next_at);
end;
$$;
revoke all on function public.claim_sms_outbox_message(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_sms_outbox_message(uuid,uuid,uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- Finish: the phone reports what happened. Idempotent per outcome.
-- ---------------------------------------------------------------------------
create function public.finish_sms_outbox_message(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text,
  p_message_id uuid,p_lease_token uuid,p_outcome text,p_error text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  msg public.sms_outbox%rowtype;
begin
  if not public.sms_outbox_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash)
    or p_message_id is null or p_lease_token is null
    or p_outcome is null or p_outcome not in ('sent','failed')
    or (p_error is not null and p_error !~ '^[a-z0-9_]{1,40}$') then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into msg from public.sms_outbox where id=p_message_id and tenant_id=p_tenant_id for update;
  if msg.id is null or msg.claimed_by_device is distinct from p_device_id
    or msg.claimed_by_actor is distinct from p_actor_id or msg.lease_token is distinct from p_lease_token then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if msg.status in ('sent','failed') then
    if msg.status=p_outcome and (p_outcome='sent' or msg.error is distinct from 'unconfirmed') then
      return jsonb_build_object('ok',true); end if;
    -- The sweep gave up waiting; the phone's own report is the truth.
    if msg.status='failed' and msg.error='unconfirmed' then
      update public.sms_outbox set status=p_outcome,
        sent_at=case when p_outcome='sent' then clock_timestamp() else null end,
        error=case when p_outcome='failed' then coalesce(p_error,'delivery_failed') else null end
        where id=msg.id;
      return jsonb_build_object('ok',true); end if;
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if msg.status<>'claimed' then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  update public.sms_outbox set status=p_outcome,
    sent_at=case when p_outcome='sent' then clock_timestamp() else null end,
    error=case when p_outcome='failed' then coalesce(p_error,'delivery_failed') else null end
    where id=msg.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.finish_sms_outbox_message(uuid,uuid,uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_sms_outbox_message(uuid,uuid,uuid,text,uuid,uuid,text,text) to service_role;

comment on table public.sms_outbox is
  'Automated marketing texts. Service-role inserts only (the planner); phones claim through claim_sms_outbox_message, which re-checks consent, exits, caps and limits and releases each body once. Never re-send an unconfirmed row.';

-- Rollback:
--   drop function public.finish_sms_outbox_message(uuid,uuid,uuid,text,uuid,uuid,text,text);
--   drop function public.claim_sms_outbox_message(uuid,uuid,uuid,text);
--   drop function public.sweep_sms_outbox(uuid);
--   drop function public.sms_is_quiet_at(timestamptz,text,text);
--   drop function public.sms_outbox_delivery_allowed(uuid,uuid,uuid,text);
--   drop table public.sms_outbox; drop table public.sms_settings; drop table public.sms_automations;
