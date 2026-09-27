-- Atomic owner-facing history. The ledger remains the balance authority.
-- No public/tenant direct access: the API authorizes loyalty_manage first.
create table if not exists public.loyalty_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid not null,
  customer_key text not null,
  kind text not null,
  delta numeric,
  reward_id uuid,
  source_id uuid not null,
  event_key text not null unique,
  program_name text not null,
  reward_terms jsonb,
  previous_status text,
  status text,
  order_backend text,
  external_order_id text,
  outlet_id uuid,
  actor_id uuid,
  note text,
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists loyalty_activity_tenant_time_idx on public.loyalty_activity(tenant_id,occurred_at desc,id desc);
create index if not exists loyalty_activity_member_time_idx on public.loyalty_activity(tenant_id,customer_key,occurred_at desc,id desc);
create index if not exists loyalty_activity_kind_time_idx on public.loyalty_activity(tenant_id,kind,occurred_at desc,id desc);
alter table public.loyalty_activity enable row level security;
revoke all on public.loyalty_activity from anon,authenticated;
grant select,insert on public.loyalty_activity to service_role;

create or replace function public.loyalty_activity_immutable() returns trigger language plpgsql set search_path=public as $$
begin
  -- Tenant deletion may cascade; individual log records cannot be rewritten.
  if tg_op='DELETE' and not exists(select 1 from tenants where id=old.tenant_id) then return old; end if;
  raise exception 'Loyalty activity is immutable; record a new correction';
end $$;
drop trigger if exists loyalty_activity_immutable on public.loyalty_activity;
create trigger loyalty_activity_immutable before update or delete on public.loyalty_activity for each row execute function public.loyalty_activity_immutable();

create or replace function public.record_loyalty_activity() returns trigger language plpgsql security definer set search_path=public as $$
declare
  title text;
  branch uuid;
  order_branch uuid;
  staff uuid;
  reason text;
  previous text;
begin
  select name,outlet_id into title,branch from loyalty_programs where id=new.program_id and tenant_id=new.tenant_id;
  if tg_table_name='loyalty_ledger' then
    if new.is_shadow then return new; end if;
    if new.external_order_id is not null then
      if new.order_backend='platform_supabase' then
        select outlet_id into order_branch from orders where tenant_id=new.tenant_id and id::text=new.external_order_id;
      else
        select outlet_id into order_branch from customer_external_orders where tenant_id=new.tenant_id and backend=new.order_backend and external_order_id=new.external_order_id;
      end if;
      branch:=coalesce(order_branch,branch);
    end if;
    insert into loyalty_activity(tenant_id,program_id,customer_key,kind,delta,source_id,event_key,program_name,order_backend,external_order_id,outlet_id,actor_id,note,occurred_at)
    values(new.tenant_id,new.program_id,new.customer_key,new.kind,new.delta,new.id,'ledger:'||new.id,coalesce(title,'Loyalty program'),new.order_backend,new.external_order_id,branch,new.actor,new.note,new.created_at)
    on conflict(event_key) do nothing;
  else
    if tg_op='UPDATE' then
      if old.status is not distinct from new.status then return new; end if;
      previous:=old.status;
    end if;
    -- Manual resolution carries an explicit actor/reason. Automatic transitions
    -- use the reservation actor only for reservation/consumption, never refunds.
    if new.status in ('consumed','voided') and new.resolved_by is not null and previous is distinct from 'reserved' then
      staff:=new.resolved_by; reason:=new.resolution_note;
    elsif new.status in ('reserved','consumed') then
      select reserved_by,coalesce(outlet_id,branch) into staff,branch from loyalty_reservations
        where tenant_id=new.tenant_id and entitlement_id=new.id order by created_at desc,id desc limit 1;
    end if;
    insert into loyalty_activity(tenant_id,program_id,customer_key,kind,reward_id,source_id,event_key,program_name,reward_terms,previous_status,status,order_backend,external_order_id,outlet_id,actor_id,note)
    values(new.tenant_id,new.program_id,new.customer_key,'reward_'||new.status,new.id,new.id,
      case when tg_op='INSERT' then 'reward-issued:'||new.id else 'reward-transition:'||gen_random_uuid() end,
      coalesce(new.terms->>'programName',title,'Loyalty program'),
      jsonb_build_object('reward',new.terms->'reward'),previous,new.status,
      case when new.status='consumed' then new.consumed_order_backend end,
      case when new.status='consumed' then new.consumed_order_id end,branch,staff,reason)
    on conflict(event_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.record_loyalty_activity() from public,anon,authenticated;
drop trigger if exists loyalty_ledger_activity on public.loyalty_ledger;
create trigger loyalty_ledger_activity after insert on public.loyalty_ledger for each row execute function public.record_loyalty_activity();
drop trigger if exists loyalty_reward_activity on public.loyalty_entitlements;
create trigger loyalty_reward_activity after insert or update of status on public.loyalty_entitlements for each row execute function public.record_loyalty_activity();

-- Existing ledger events are evidence. Existing rewards are snapshots, not an
-- invented sequence of historical claims. Re-running this migration is safe.
insert into public.loyalty_activity(tenant_id,program_id,customer_key,kind,delta,source_id,event_key,program_name,order_backend,external_order_id,outlet_id,actor_id,note,occurred_at)
select l.tenant_id,l.program_id,l.customer_key,l.kind,l.delta,l.id,'ledger:'||l.id,p.name,l.order_backend,l.external_order_id,coalesce(o.outlet_id,x.outlet_id,p.outlet_id),l.actor,l.note,l.created_at
from public.loyalty_ledger l join public.loyalty_programs p on p.id=l.program_id and p.tenant_id=l.tenant_id
left join public.orders o on l.order_backend='platform_supabase' and o.tenant_id=l.tenant_id and o.id::text=l.external_order_id
left join public.customer_external_orders x on x.tenant_id=l.tenant_id and x.backend=l.order_backend and x.external_order_id=l.external_order_id
where not l.is_shadow on conflict(event_key) do nothing;

insert into public.loyalty_activity(tenant_id,program_id,customer_key,kind,reward_id,source_id,event_key,program_name,reward_terms,status,order_backend,external_order_id,outlet_id,actor_id,note,occurred_at)
select e.tenant_id,e.program_id,e.customer_key,'reward_snapshot',e.id,e.id,'reward-snapshot:'||e.id,
coalesce(e.terms->>'programName',p.name),jsonb_build_object('reward',e.terms->'reward'),e.status,
e.consumed_order_backend,e.consumed_order_id,p.outlet_id,e.resolved_by,e.resolution_note,coalesce(e.consumed_at,e.updated_at,e.issued_at)
from public.loyalty_entitlements e join public.loyalty_programs p on p.id=e.program_id and p.tenant_id=e.tenant_id
where not exists(select 1 from public.loyalty_activity a where a.reward_id=e.id and a.tenant_id=e.tenant_id)
on conflict(event_key) do nothing;
