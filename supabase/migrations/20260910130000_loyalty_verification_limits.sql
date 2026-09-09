-- No FK: missing tenants/challenges consume budget, and deleting a tenant must
-- not erase global IP abuse history. Only server-derived keyed hashes are stored.
create table public.loyalty_verification_rate_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index loyalty_verification_rate_phone_idx on public.loyalty_verification_rate_events(tenant_id,phone_hash,created_at desc);
create index loyalty_verification_rate_ip_idx on public.loyalty_verification_rate_events(ip_hash,created_at desc);
create index loyalty_verification_rate_tenant_idx on public.loyalty_verification_rate_events(tenant_id,created_at desc);
alter table public.loyalty_verification_rate_events enable row level security;
revoke all on public.loyalty_verification_rate_events from public,anon,authenticated,service_role;
grant select on public.loyalty_verification_rate_events to service_role;
create policy loyalty_verification_rate_service_select on public.loyalty_verification_rate_events for select to service_role using(true);

create or replace function public.allow_loyalty_verification_attempt(
  p_tenant_id uuid, p_phone_hash text, p_ip_hash text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  attempt_time timestamptz;
begin
  -- A fresh READ COMMITTED snapshot after lock waits is necessary for quotas.
  if current_setting('transaction_isolation') <> 'read committed'
    or p_tenant_id is null
    or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','invalid_claim');
  end if;
  -- Consistent, separate namespaces: IP first, then tenant. The tenant lock
  -- also serializes its phone quota. Hash collisions only reduce concurrency.
  perform pg_advisory_xact_lock(18704,hashtext(p_ip_hash));
  perform pg_advisory_xact_lock(18705,hashtext(p_tenant_id::text));
  attempt_time:=clock_timestamp();
  if (select count(*) from public.loyalty_verification_rate_events where ip_hash=p_ip_hash
      and created_at>attempt_time-interval '15 minutes')>=30
    or (select count(*) from public.loyalty_verification_rate_events where ip_hash=p_ip_hash
      and created_at>attempt_time-interval '24 hours')>=100
    or (select count(*) from public.loyalty_verification_rate_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>attempt_time-interval '15 minutes')>=10
    or (select count(*) from public.loyalty_verification_rate_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>attempt_time-interval '24 hours')>=30
    or (select count(*) from public.loyalty_verification_rate_events where tenant_id=p_tenant_id
      and created_at>attempt_time-interval '1 minute')>=120
    or (select count(*) from public.loyalty_verification_rate_events where tenant_id=p_tenant_id
      and created_at>attempt_time-interval '1 hour')>=2000 then
    return jsonb_build_object('ok',false,'error','invalid_claim');
  end if;
  insert into public.loyalty_verification_rate_events(tenant_id,phone_hash,ip_hash,created_at)
    values(p_tenant_id,p_phone_hash,p_ip_hash,attempt_time);
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.allow_loyalty_verification_attempt(uuid,text,text) from public,anon,authenticated;
grant execute on function public.allow_loyalty_verification_attempt(uuid,text,text) to service_role;

comment on function public.allow_loyalty_verification_attempt(uuid,text,text) is
  'Trusted server only; call once in its OWN READ COMMITTED transaction BEFORE verify_loyalty_claim so its committed event survives verification failure. Never auto-retry an uncertain acknowledgement. HMAC phone hash must come from the same canonical PH mobile proof used for verification; IP hash must be tenant-independent and derive from a trusted normalized ingress IP. Counts well-formed attempts even for missing tenants/challenges. Limits: global IP 30/15 minutes, 100/24 hours; tenant-phone 10/15 minutes, 30/24 hours; tenant 120/minute, 2000/hour. Saturated requests add no events. No OTPs, phones, raw IPs, or claim tokens are stored here.';
