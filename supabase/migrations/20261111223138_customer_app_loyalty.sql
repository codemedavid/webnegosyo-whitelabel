-- APPLIED to platform 2026-11-12 in two parts: 20261111223138_customer_app_loyalty
-- (sections 1-2) and 20261111223149_customer_app_loyalty_claim (section 3); probed.
-- Customer app, phase 5: the signed-in customer's loyalty card and a reward
-- claim QR minted from the app session (plan: docs/plans/2026-11-11-customer-app-p5-loyalty.md).
--
-- 1. app_customer_loyalty: the wallet projection of lookup_loyalty_wallet (the
--    program and reward selects are copied verbatim from the live function;
--    that function is not touched), bound to a live app session instead of a
--    typed phone number, and without the per-IP lookup limiter.
-- 2. loyalty_verified_claims may now come from an app session instead of an
--    SMS challenge: exactly one of challenge_id / app_session_id is set.
--    Readers (issue_loyalty_pos_quote, quote-issuer.ts) use token_hash and
--    entitlement_id only, so a claim from either source redeems the same way.
-- 3. issue_app_loyalty_claim: the session proved the phone by SMS at sign-in,
--    so "Use now" mints the 2-minute claim at once (owner, 2026-11-12). Same
--    lock order as verify_loyalty_claim and settlement: balance -> entitlement.
--
-- Both functions are SECURITY DEFINER and service role only.

-- ── 2. Claims from an app session ────────────────────────────────────────────

alter table public.loyalty_verified_claims
  alter column challenge_id drop not null;

alter table public.loyalty_verified_claims
  add column if not exists app_session_id uuid
    references public.customer_app_sessions(id) on delete cascade;

alter table public.loyalty_verified_claims
  drop constraint if exists loyalty_verified_claims_one_source;
alter table public.loyalty_verified_claims
  add constraint loyalty_verified_claims_one_source
    check (num_nonnulls(challenge_id, app_session_id) = 1);

-- The per-session claim budget counts recent claims through this index.
create index if not exists loyalty_verified_claims_app_session_idx
  on public.loyalty_verified_claims (app_session_id, created_at)
  where app_session_id is not null;

-- ── 1. The signed-in customer's wallet ───────────────────────────────────────

create or replace function public.app_customer_loyalty(p_tenant_id uuid, p_session_token_hash text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  t timestamptz := clock_timestamp();
  session public.customer_app_sessions%rowtype;
  phone text;
  p_customer_key text;
  programs jsonb;
  rewards jsonb;
begin
  if p_tenant_id is null or p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','signed_out');
  end if;
  select * into session from public.customer_app_sessions
    where token_hash=p_session_token_hash and tenant_id=p_tenant_id;
  if not found or session.revoked_at is not null or session.expires_at<=t or session.absolute_expires_at<=t then
    return jsonb_build_object('ok',false,'error','signed_out');
  end if;
  select c.phone_e164 into phone from public.customers c
    where c.id=session.customer_id and c.tenant_id=p_tenant_id;
  -- Loyalty is keyed by Philippine mobile number; anything else has no card.
  if phone is null or phone !~ '^[+]639[0-9]{9}$' then
    return jsonb_build_object('ok',true,'live',false,'customerKey',null,'programs','[]'::jsonb,'rewards','[]'::jsonb);
  end if;
  p_customer_key := 'phone:'||phone;
  if not exists(select 1 from tenants where id=p_tenant_id and loyalty_enabled and not loyalty_shadow) then
    return jsonb_build_object('ok',true,'live',false,'customerKey',p_customer_key,'programs','[]'::jsonb,'rewards','[]'::jsonb);
  end if;
  perform expire_loyalty_reservations(p_tenant_id);
  -- Verbatim from lookup_loyalty_wallet (live 2026-11-12).
  select coalesce(jsonb_agg(row),'[]'::jsonb) into programs from (
   select p.id,p.name,case when p.ends_at<=t then 'ended' else p.status end as status,p.scope,o.name as "branchName",v.rules,
    coalesce(b.balance,0) as balance
   from loyalty_programs p join loyalty_program_versions v on v.id=p.current_version_id and v.tenant_id=p_tenant_id
   left join loyalty_balances b on b.program_id=p.id and b.tenant_id=p_tenant_id and b.customer_key=p_customer_key
   left join outlets o on o.id=p.outlet_id and o.tenant_id=p_tenant_id
   where p.tenant_id=p_tenant_id and (
     (p.status in ('active','paused') and (p.activates_at is null or p.activates_at<=t) and (p.ends_at is null or p.ends_at>t))
     or (b.id is not null and p.status in ('active','paused','ended'))
    )
   order by p.created_at,p.id limit 100
  ) row;
  select coalesce(jsonb_agg(row),'[]'::jsonb) into rewards from (
   select e.id,e.terms,e.expires_at as "expiresAt",p.scope,o.name as "branchName"
   from loyalty_entitlements e join loyalty_programs p on p.id=e.program_id and p.tenant_id=p_tenant_id
   left join outlets o on o.id=p.outlet_id and o.tenant_id=p_tenant_id
   where e.tenant_id=p_tenant_id and e.customer_key=p_customer_key and e.status in ('issued','restored')
    and (e.expires_at is null or e.expires_at>t)
   order by e.expires_at nulls last,e.issued_at,e.id limit 100
  ) row;
  return jsonb_build_object('ok',true,'live',true,'customerKey',p_customer_key,'programs',programs,'rewards',rewards);
end;
$$;

-- ── 3. "Use now": a claim minted from the app session ────────────────────────

create or replace function public.issue_app_loyalty_claim(
  p_tenant_id uuid, p_session_token_hash text, p_entitlement_id uuid, p_claim_token_hash text
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  t timestamptz;
  session public.customer_app_sessions%rowtype;
  phone text;
  v_customer_key text;
  reward public.loyalty_entitlements%rowtype;
  claim public.loyalty_verified_claims%rowtype;
  refused constant jsonb := jsonb_build_object('ok',false,'error','unavailable');
begin
  if p_tenant_id is null or p_entitlement_id is null
    or p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$'
    or p_claim_token_hash is null or p_claim_token_hash !~ '^[0-9a-f]{64}$' then
    return refused;
  end if;
  -- Hold the rollout flags stable through commit, as verify_loyalty_claim does.
  perform 1 from public.tenants where id=p_tenant_id and loyalty_enabled is true
    and loyalty_shadow is false for share;
  if not found then return refused; end if;

  t := clock_timestamp();
  -- FOR SHARE: a sign-out or account deletion cannot slip in under the claim.
  select * into session from public.customer_app_sessions
    where token_hash=p_session_token_hash and tenant_id=p_tenant_id for share;
  if not found or session.revoked_at is not null or session.expires_at<=t or session.absolute_expires_at<=t then
    return refused;
  end if;
  select c.phone_e164 into phone from public.customers c
    where c.id=session.customer_id and c.tenant_id=p_tenant_id;
  if phone is null or phone !~ '^[+]639[0-9]{9}$' then return refused; end if;
  v_customer_key := 'phone:'||phone;

  -- Discover the lock keys without locking, then balance -> entitlement,
  -- matching earning reversals, settlement and verify_loyalty_claim.
  select * into reward from public.loyalty_entitlements where id=p_entitlement_id and tenant_id=p_tenant_id;
  if not found or reward.customer_key is distinct from v_customer_key then return refused; end if;
  perform 1 from public.loyalty_balances
    where program_id=reward.program_id and customer_key=reward.customer_key for update;
  select * into reward from public.loyalty_entitlements where id=p_entitlement_id and tenant_id=p_tenant_id for update;
  t := clock_timestamp();
  if reward.customer_key is distinct from v_customer_key
    or reward.status not in ('issued','restored')
    or (reward.expires_at is not null and reward.expires_at<=t) then
    return refused;
  end if;

  -- At most 6 claims per session per 10 minutes, counted under a per-session lock.
  perform pg_advisory_xact_lock(hashtextextended('app-loyalty-claim:'||session.id::text,0));
  if (select count(*) from public.loyalty_verified_claims
      where app_session_id=session.id and created_at>t-interval '10 minutes')>=6 then
    return jsonb_build_object('ok',false,'error','rate_limited');
  end if;

  t := clock_timestamp();
  insert into public.loyalty_verified_claims(tenant_id,challenge_id,app_session_id,entitlement_id,token_hash,created_at,expires_at)
    values(p_tenant_id,null,session.id,reward.id,p_claim_token_hash,t,
      least(t+interval '2 minutes',coalesce(reward.expires_at,'infinity'::timestamptz)))
    returning * into claim;
  return jsonb_build_object('ok',true,'expiresAt',claim.expires_at);
end;
$$;

revoke all on function public.app_customer_loyalty(uuid, text) from public, anon, authenticated;
revoke all on function public.issue_app_loyalty_claim(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.app_customer_loyalty(uuid, text) to service_role;
grant execute on function public.issue_app_loyalty_claim(uuid, text, uuid, text) to service_role;
