-- Phone identity remains on the entitlement. Challenges and claims do not
-- duplicate it: the trusted server supplies a paired canonical identity/hash proof.

create table public.loyalty_verified_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  challenge_id uuid not null unique references public.loyalty_otp_challenges(id) on delete cascade,
  entitlement_id uuid not null references public.loyalty_entitlements(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '2 minutes')
);

create or replace function public.verify_loyalty_claim(
  p_tenant_id uuid, p_challenge_id uuid, p_candidate_code_hash text, p_claim_token_hash text,
  p_expected_customer_key text, p_expected_phone_hash text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  challenge public.loyalty_otp_challenges%rowtype;
  claim public.loyalty_verified_claims%rowtype;
  reward public.loyalty_entitlements%rowtype;
  reward_id uuid;
  verified_time timestamptz;
begin
  if p_tenant_id is null or p_challenge_id is null
    or p_candidate_code_hash is null or p_candidate_code_hash !~ '^[0-9a-f]{64}$'
    or p_claim_token_hash is null or p_claim_token_hash !~ '^[0-9a-f]{64}$'
    or p_expected_phone_hash is null or p_expected_phone_hash !~ '^[0-9a-f]{64}$'
    or p_expected_customer_key is null or p_expected_customer_key !~ '^phone:[+]639[0-9]{9}$' then
    return jsonb_build_object('ok',false,'error','invalid_claim');
  end if;
  -- Hold the rollout flags stable through commit, including after a lock wait.
  perform 1 from public.tenants where id=p_tenant_id and loyalty_enabled is true
    and loyalty_shadow is false for share;
  if not found then return jsonb_build_object('ok',false,'error','invalid_claim'); end if;
  -- Discover lock keys without locking, then lock balance -> entitlement -> challenge,
  -- matching earning reversals and settlement. Recheck the binding under those locks.
  select entitlement_id into reward_id from public.loyalty_otp_challenges
    where id=p_challenge_id and tenant_id=p_tenant_id;
  select * into reward from public.loyalty_entitlements where id=reward_id and tenant_id=p_tenant_id;
  if not found then return jsonb_build_object('ok',false,'error','invalid_claim'); end if;
  perform 1 from public.loyalty_balances
    where program_id=reward.program_id and customer_key=reward.customer_key for update;
  select * into reward from public.loyalty_entitlements where id=reward_id and tenant_id=p_tenant_id for update;
  select * into challenge from public.loyalty_otp_challenges where id=p_challenge_id and tenant_id=p_tenant_id for update;
  if not found or challenge.attempts < 0 or challenge.max_attempts not between 1 and 5
    or challenge.attempts >= challenge.max_attempts or challenge.verified_at is not null
    or challenge.expires_at <= clock_timestamp()
    or challenge.expires_at > challenge.created_at + interval '5 minutes'
    or challenge.created_at > clock_timestamp() or challenge.purpose <> 'claim' then
    return jsonb_build_object('ok',false,'error','invalid_claim');
  end if;
  if reward.id is null or challenge.entitlement_id is distinct from reward.id
    or p_expected_customer_key is distinct from reward.customer_key
    or p_expected_phone_hash is distinct from challenge.phone_hash
    or reward.status not in ('issued','restored')
    or (reward.expires_at is not null and reward.expires_at <= clock_timestamp()) then
    return jsonb_build_object('ok',false,'error','invalid_claim');
  end if;
  if challenge.code_hash is distinct from p_candidate_code_hash then
    update public.loyalty_otp_challenges set attempts=attempts+1 where id=challenge.id;
    return jsonb_build_object('ok',false,'error','invalid_claim');
  end if;
  verified_time := clock_timestamp();
  update public.loyalty_otp_challenges set verified_at=verified_time where id=challenge.id;
  insert into public.loyalty_verified_claims(tenant_id,challenge_id,entitlement_id,token_hash,created_at,expires_at)
    values(p_tenant_id,challenge.id,challenge.entitlement_id,p_claim_token_hash,verified_time,verified_time+interval '2 minutes')
    returning * into claim;
  return jsonb_build_object('ok',true,'claimId',claim.id,'expiresAt',claim.expires_at);
end;
$$;

alter table public.loyalty_verified_claims enable row level security;
revoke all on public.loyalty_verified_claims from public, anon, authenticated, service_role;
-- Writes go through the definer RPC; future reservation consumes used_at atomically.
grant select on public.loyalty_verified_claims to service_role;
create policy loyalty_verified_claims_service_select on public.loyalty_verified_claims
  for select to service_role using (true);
revoke all on public.loyalty_otp_challenges from public, anon, authenticated;
revoke all on function public.verify_loyalty_claim(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.verify_loyalty_claim(uuid,uuid,text,text,text,text) to service_role;

comment on function public.verify_loyalty_claim(uuid,uuid,text,text,text,text) is
  'Trusted server only: keyed hex64 hashes. Server MUST derive expected_customer_key=phone:+E164 and expected_phone_hash=hashPhone(tenant,phone) from the SAME canonical PH phone, never accept them independently from clients. SQL binds these to entitlement identity and challenge hash. One successful verification creates a two-minute claim, not a reservation. Invalid attempts return normally so counters commit. Replays are invalid: retain the generated token across an uncertain acknowledgement or issue a new challenge; never recover plaintext from SQL.';
