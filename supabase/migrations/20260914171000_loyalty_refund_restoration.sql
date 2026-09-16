-- Receipt mapping survives destination IDs. Restore once per fully refunded
-- canonical settlement, with an append-only record and the original expiry.
create table public.loyalty_refund_restorations (
 settlement_id uuid primary key references public.loyalty_pos_settlements(id),
 entitlement_id uuid not null references public.loyalty_entitlements(id),
 disposition text not null, created_at timestamptz not null default now()
);
alter table public.loyalty_refund_restorations enable row level security;
revoke all on public.loyalty_refund_restorations from public,anon,authenticated;
grant select on public.loyalty_refund_restorations to service_role;
alter table public.loyalty_pos_projection_jobs add column refund_checked_at timestamptz;
create or replace function public.claim_loyalty_refund_checks(p_limit integer default 5)
returns setof public.loyalty_pos_projection_jobs language sql security definer set search_path=public as $$
 with candidates as (
  select j.id from loyalty_pos_projection_jobs j where j.status='completed'
   and (j.refund_checked_at is null or j.refund_checked_at<clock_timestamp()-interval '1 hour')
   and not exists(select 1 from loyalty_refund_restorations r where r.settlement_id=j.settlement_id)
  order by j.refund_checked_at nulls first,j.completed_at limit greatest(1,least(coalesce(p_limit,5),25)) for update skip locked
 ) update loyalty_pos_projection_jobs j set refund_checked_at=clock_timestamp() from candidates c where j.id=c.id returning j.*;
$$;

-- Only the server reconciler calls this after reading the destination payment
-- ledger. A handset's lifecycle status is never proof that money was refunded.
create or replace function public.restore_loyalty_refunded_receipt(p_tenant_id uuid,p_settlement_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare reward loyalty_entitlements%rowtype; source loyalty_ledger%rowtype; next_status text;
begin
 select e.* into reward from loyalty_entitlements e join loyalty_reservations h on h.entitlement_id=e.id
  join loyalty_pos_settlements s on s.reservation_id=h.id where s.id=p_settlement_id and s.tenant_id=p_tenant_id;
 if not found then return false; end if;
 perform 1 from loyalty_balances where program_id=reward.program_id and customer_key=reward.customer_key for update;
 select * into reward from loyalty_entitlements where id=reward.id for update;
 if exists(select 1 from loyalty_refund_restorations where settlement_id=p_settlement_id) then return false; end if;
 if reward.status<>'consumed' or reward.consumed_order_backend<>'platform_supabase' or reward.consumed_order_id<>p_settlement_id::text then return false; end if;
 next_status:=case when reward.expires_at<=clock_timestamp() then 'expired' else 'restored' end;
 select * into source from loyalty_ledger where id=reward.source_ledger_id;
 if found and exists(select 1 from loyalty_ledger l where l.program_id=source.program_id and l.order_backend=source.order_backend
  and l.external_order_id=source.external_order_id and l.kind='reverse') then
  -- The originating purchase was also reversed while this reward was spent.
  -- Void the returned reward and return its retained threshold cost once.
  next_status:='voided';
  update loyalty_balances set balance=balance+coalesce(reward.threshold_spent,0)
   where program_id=reward.program_id and customer_key=reward.customer_key;
 end if;
 update loyalty_entitlements set status=next_status where id=reward.id;
 insert into loyalty_refund_restorations(settlement_id,entitlement_id,disposition) values(p_settlement_id,reward.id,next_status);
 insert into loyalty_ledger(tenant_id,program_id,version_id,customer_key,kind,delta,order_backend,external_order_id,note)
  values(p_tenant_id,reward.program_id,reward.version_id,reward.customer_key,'correction',case when next_status='voided' then coalesce(reward.threshold_spent,0) else 0 end,'platform_supabase',p_settlement_id::text,'Reward returned after verified full refund: '||next_status);
 return true;
end $$;
revoke all on function public.claim_loyalty_refund_checks(integer) from public,anon,authenticated;
revoke all on function public.restore_loyalty_refunded_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_loyalty_refund_checks(integer) to service_role;
grant execute on function public.restore_loyalty_refunded_receipt(uuid,uuid) to service_role;
