-- Platform-authoritative receipts for reward-using POS sales. No client may
-- write these tables. A future authenticated quote service supplies a priced
-- snapshot; the settlement service calls this RPC after validating tender.
-- External orders are projections, never the authority for reward consumption.
create table public.loyalty_pos_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  reservation_id uuid not null references public.loyalty_reservations(id),
  customer_key text not null,
  outlet_id uuid references public.outlets(id),
  created_by uuid not null references auth.users(id),
  order_backend text not null check(order_backend in ('platform_supabase','convex','tenant_supabase')),
  total_centavos bigint not null check(total_centavos >= 0),
  order_snapshot jsonb not null check(jsonb_typeof(order_snapshot) = 'object'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.loyalty_pos_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  quote_id uuid not null unique references public.loyalty_pos_quotes(id),
  reservation_id uuid not null unique references public.loyalty_reservations(id),
  client_order_id text not null check(length(client_order_id) between 1 and 128),
  cashier_id uuid not null references auth.users(id),
  total_centavos bigint not null check(total_centavos >= 0),
  -- Method/proof references only; never store card credentials here.
  payment jsonb not null check(jsonb_typeof(payment) = 'object'),
  order_snapshot jsonb not null,
  settled_at timestamptz not null default now(),
  unique(tenant_id,client_order_id)
);

create table public.loyalty_pos_projection_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  settlement_id uuid not null unique references public.loyalty_pos_settlements(id),
  order_backend text not null check(order_backend in ('platform_supabase','convex','tenant_supabase')),
  status text not null default 'pending' check(status in ('pending','claimed','completed','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  external_order_id text,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index loyalty_pos_projection_pending_idx on public.loyalty_pos_projection_jobs(available_at)
  where status in ('pending','claimed');

alter table public.loyalty_pos_quotes enable row level security;
alter table public.loyalty_pos_settlements enable row level security;
alter table public.loyalty_pos_projection_jobs enable row level security;
revoke all on public.loyalty_pos_quotes, public.loyalty_pos_settlements, public.loyalty_pos_projection_jobs from anon,authenticated;
grant all on public.loyalty_pos_quotes, public.loyalty_pos_settlements, public.loyalty_pos_projection_jobs to service_role;

create or replace function public.settle_loyalty_pos_sale(
  p_tenant_id uuid, p_quote_id uuid, p_client_order_id text, p_actor uuid, p_payment jsonb
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  q public.loyalty_pos_quotes%rowtype;
  receipt public.loyalty_pos_settlements%rowtype;
  reward public.loyalty_entitlements%rowtype;
  hold public.loyalty_reservations%rowtype;
  actor_branch uuid;
  actor_is_owner boolean;
  program_scope text;
  program_branch uuid;
begin
  select au.outlet_id, (au.role='superadmin' or au.is_owner is true)
    into actor_branch,actor_is_owner
    from public.app_users au where au.user_id=p_actor
      and (au.role='superadmin' or (au.role='admin' and au.tenant_id=p_tenant_id
        and (au.is_owner is true or au.permissions is null
          or au.permissions @> array['pos','loyalty_redeem']::text[])));
  if not found then raise exception 'Forbidden'; end if;
  if p_quote_id is null or p_client_order_id is null or length(trim(p_client_order_id)) not between 1 and 128
    or p_payment is null or jsonb_typeof(p_payment)<>'object' then
    raise exception 'Invalid settlement request';
  end if;

  -- Same-key requests serialize, including retries arriving during commit.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_client_order_id,0));
  select * into receipt from public.loyalty_pos_settlements
    where tenant_id=p_tenant_id and client_order_id=p_client_order_id;
  if found then
    if receipt.quote_id<>p_quote_id or receipt.cashier_id<>p_actor or receipt.payment<>p_payment then
      raise exception 'Idempotency key belongs to a different request';
    end if;
  else
    select * into q from public.loyalty_pos_quotes
      where id=p_quote_id and tenant_id=p_tenant_id and created_by=p_actor for update;
    if not found then raise exception 'Quote not found'; end if;
    if exists(select 1 from public.loyalty_pos_settlements where quote_id=q.id) then
      raise exception 'Quote already settled';
    end if;
    if q.expires_at<=clock_timestamp() then raise exception 'Quote expired'; end if;
    if not actor_is_owner and actor_branch is not null and actor_branch is distinct from q.outlet_id then
      raise exception 'Forbidden branch';
    end if;
    if not exists(select 1 from public.tenants where id=p_tenant_id and loyalty_enabled and not loyalty_shadow) then
      raise exception 'Live loyalty is not enabled';
    end if;

    -- Lock in the same order as earning reversals: balance, entitlement, hold.
    select * into hold from public.loyalty_reservations where id=q.reservation_id and tenant_id=p_tenant_id;
    if not found then raise exception 'Reservation not found'; end if;
    select * into reward from public.loyalty_entitlements where id=hold.entitlement_id and tenant_id=p_tenant_id;
    if not found then raise exception 'Reward not found'; end if;
    perform 1 from public.loyalty_balances where program_id=reward.program_id and customer_key=reward.customer_key for update;
    select * into reward from public.loyalty_entitlements where id=reward.id for update;
    select * into hold from public.loyalty_reservations where id=q.reservation_id for update;
    if hold.status<>'held' or hold.expires_at<=clock_timestamp() or reward.status<>'reserved'
      or (reward.expires_at is not null and reward.expires_at<=clock_timestamp()) then
      raise exception 'Reward reservation expired or unavailable';
    end if;
    if reward.customer_key<>q.customer_key or hold.reserved_by is distinct from p_actor
      or hold.outlet_id is distinct from q.outlet_id then
      raise exception 'Reservation does not match quote';
    end if;
    select scope,outlet_id into program_scope,program_branch from public.loyalty_programs
      where id=reward.program_id and tenant_id=p_tenant_id;
    if not found or (program_scope='branch' and program_branch is distinct from q.outlet_id) then
      raise exception 'Reward is not valid at this branch';
    end if;

    insert into public.loyalty_pos_settlements(tenant_id,quote_id,reservation_id,client_order_id,cashier_id,total_centavos,payment,order_snapshot)
      values(p_tenant_id,q.id,hold.id,p_client_order_id,p_actor,q.total_centavos,p_payment,q.order_snapshot)
      returning * into receipt;
    -- consumed_order_id refers to the canonical platform settlement receipt.
    update public.loyalty_entitlements set status='consumed',consumed_at=receipt.settled_at,
      consumed_order_backend='platform_supabase',consumed_order_id=receipt.id::text where id=reward.id;
    update public.loyalty_reservations set status='consumed',order_backend='platform_supabase',
      external_order_id=receipt.id::text where id=hold.id;
    insert into public.loyalty_ledger(tenant_id,program_id,version_id,customer_key,kind,delta,order_backend,external_order_id,actor,note)
      values(p_tenant_id,reward.program_id,reward.version_id,reward.customer_key,'redeem',0,'platform_supabase',receipt.id::text,p_actor,'POS settlement');
    insert into public.loyalty_pos_projection_jobs(tenant_id,settlement_id,order_backend)
      values(p_tenant_id,receipt.id,q.order_backend);
  end if;
  return jsonb_build_object('settlementId',receipt.id,'clientOrderId',receipt.client_order_id,
    'totalCentavos',receipt.total_centavos,'settledAt',receipt.settled_at);
end;
$$;
revoke all on function public.settle_loyalty_pos_sale(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.settle_loyalty_pos_sale(uuid,uuid,text,uuid,jsonb) to service_role;

-- An expired lease may be retried, so the destination MUST deduplicate on
-- settlement_id. A lost acknowledgement must never create another sale.
create or replace function public.claim_loyalty_pos_projections(p_limit integer default 10)
returns setof public.loyalty_pos_projection_jobs
language sql security definer set search_path=public as $$
  with candidates as (
    select id from public.loyalty_pos_projection_jobs
      where (status='pending' and available_at<=clock_timestamp())
        or (status='claimed' and lease_expires_at<=clock_timestamp())
      order by available_at,id limit greatest(1,least(coalesce(p_limit,10),25))
      for update skip locked
  )
  update public.loyalty_pos_projection_jobs j
    set status='claimed', attempts=attempts+1, lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()+interval '2 minutes'
    from candidates c where j.id=c.id returning j.*;
$$;

create or replace function public.finish_loyalty_pos_projection(
  p_job_id uuid,p_lease_token uuid,p_external_order_id text,p_error text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  if p_error is null and (p_external_order_id is null or length(trim(p_external_order_id))=0) then
    raise exception 'An external order reference is required to complete projection';
  end if;
  update public.loyalty_pos_projection_jobs
    set status=case when p_error is null then 'completed' when attempts>=8 then 'failed' else 'pending' end,
      external_order_id=case when p_error is null then p_external_order_id else external_order_id end,
      completed_at=case when p_error is null then clock_timestamp() else null end,
      available_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer),
      last_error=left(p_error,500),lease_token=null,lease_expires_at=null
    where id=p_job_id and status='claimed' and lease_token=p_lease_token
      and lease_expires_at>clock_timestamp();
  get diagnostics affected=row_count;
  return affected=1;
end;
$$;
revoke all on function public.claim_loyalty_pos_projections(integer) from public,anon,authenticated;
revoke all on function public.finish_loyalty_pos_projection(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_loyalty_pos_projections(integer) to service_role;
grant execute on function public.finish_loyalty_pos_projection(uuid,uuid,text,text) to service_role;
