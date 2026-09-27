-- Captured orders are watched independently of the browser/merchant handset.
-- External source changes can be missed, so pending orders are checked again.
create table if not exists public.loyalty_earning_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  backend text not null check(backend in ('platform_supabase','tenant_supabase','convex')),
  external_order_id text not null,
  revision bigint not null default 1,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_result text,
  created_at timestamptz not null default now(),
  unique(tenant_id,backend,external_order_id)
);
create index if not exists loyalty_earning_jobs_due_idx on public.loyalty_earning_jobs(next_attempt_at);
create index if not exists loyalty_earning_jobs_tenant_idx on public.loyalty_earning_jobs(tenant_id,last_result,last_checked_at);
alter table public.loyalty_earning_jobs enable row level security;
revoke all on public.loyalty_earning_jobs from anon,authenticated;
grant select,insert,update on public.loyalty_earning_jobs to service_role;

create or replace function public.enqueue_loyalty_earning_job() returns trigger language plpgsql security definer set search_path=public as $$
declare source_backend text; source_id text;
begin
  if not exists(select 1 from tenants where id=new.tenant_id and loyalty_enabled and not loyalty_shadow) then return new; end if;
  if tg_table_name='orders' then
    source_backend:='platform_supabase'; source_id:=new.id::text;
    if tg_op='UPDATE' and (to_jsonb(old)->'status',to_jsonb(old)->'payment_status',to_jsonb(old)->'customer_contact',to_jsonb(old)->'customer_data')
      is not distinct from (to_jsonb(new)->'status',to_jsonb(new)->'payment_status',to_jsonb(new)->'customer_contact',to_jsonb(new)->'customer_data') then return new; end if;
  else
    source_backend:=new.backend; source_id:=new.external_order_id;
    if tg_op='UPDATE' and (old.status,old.payment_status,old.customer_id) is not distinct from (new.status,new.payment_status,new.customer_id) then return new; end if;
  end if;
  insert into loyalty_earning_jobs(tenant_id,backend,external_order_id)
  values(new.tenant_id,source_backend,source_id)
  on conflict(tenant_id,backend,external_order_id) do update set
    revision=loyalty_earning_jobs.revision+1,next_attempt_at=now(),attempts=0,last_result=null,lease_token=null,lease_until=null;
  return new;
end $$;
revoke all on function public.enqueue_loyalty_earning_job() from public,anon,authenticated;
drop trigger if exists orders_loyalty_recovery on public.orders;
create trigger orders_loyalty_recovery after insert or update on public.orders for each row execute function public.enqueue_loyalty_earning_job();
drop trigger if exists external_orders_loyalty_recovery on public.customer_external_orders;
create trigger external_orders_loyalty_recovery after insert or update on public.customer_external_orders for each row execute function public.enqueue_loyalty_earning_job();

create or replace function public.claim_loyalty_earning_jobs(p_limit integer default 5)
returns setof public.loyalty_earning_jobs language plpgsql security definer set search_path=public as $$
begin
  return query with candidates as (
    select j.id from loyalty_earning_jobs j join tenants t on t.id=j.tenant_id
    where j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<now())
      and t.loyalty_enabled and not t.loyalty_shadow
    -- New lifecycle events and unfinished earning take precedence over
    -- historical external-order checks. A large backfill must not hold today's
    -- missing stamp behind yesterday's already-credited orders.
    order by case when j.last_result is null then 0
                  when j.last_result in ('pending','missing_identity','failed') then 1 else 2 end,
      j.next_attempt_at,j.id for update of j skip locked limit greatest(1,least(p_limit,10))
  ) update loyalty_earning_jobs j set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    from candidates c where j.id=c.id returning j.*;
end $$;

create or replace function public.finish_loyalty_earning_job(p_id uuid,p_lease uuid,p_revision bigint,p_result text)
returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if p_result not in ('credited','already_credited','reversed','pending','ineligible','disabled','missing_identity','failed') then
    raise exception 'Invalid recovery result';
  end if;
  update loyalty_earning_jobs set lease_token=null,lease_until=null,last_checked_at=now(),last_result=p_result,
    attempts=case when p_result='failed' then attempts+1 else 0 end,
    next_attempt_at=case
      -- Platform writes have a transactional trigger, so a terminal job needs
      -- no polling. A later cancellation/payment/identity change re-enqueues
      -- it. External sources need a finite reconciliation window because an
      -- offline handset may not report their changes to the platform.
      when p_result not in ('failed','pending','missing_identity')
        and (backend='platform_supabase' or created_at<now()-interval '30 days') then 'infinity'::timestamptz
      else now()+case
      when p_result='failed' then make_interval(secs=>least(86400,60*power(2,least(attempts,10)))::integer)
      when p_result='pending' then interval '5 minutes'
      when p_result='missing_identity' then interval '1 hour'
      else interval '1 day' end end
  where id=p_id and lease_token=p_lease and revision=p_revision;
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke all on function public.claim_loyalty_earning_jobs(integer) from public,anon,authenticated;
revoke all on function public.finish_loyalty_earning_job(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_loyalty_earning_jobs(integer) to service_role;
grant execute on function public.finish_loyalty_earning_job(uuid,uuid,bigint,text) to service_role;

-- Seed recent captured orders only; older discrepancies require a reviewed
-- reconciliation batch. The worker checks eligibility and never edits balances.
insert into public.loyalty_earning_jobs(tenant_id,backend,external_order_id)
select o.tenant_id,'platform_supabase',o.id::text from public.orders o join public.tenants t on t.id=o.tenant_id
where t.loyalty_enabled and not t.loyalty_shadow and o.created_at>=now()-interval '30 days'
on conflict(tenant_id,backend,external_order_id) do nothing;
insert into public.loyalty_earning_jobs(tenant_id,backend,external_order_id)
select o.tenant_id,o.backend,o.external_order_id from public.customer_external_orders o join public.tenants t on t.id=o.tenant_id
where t.loyalty_enabled and not t.loyalty_shadow and o.created_at>=now()-interval '30 days'
on conflict(tenant_id,backend,external_order_id) do nothing;
