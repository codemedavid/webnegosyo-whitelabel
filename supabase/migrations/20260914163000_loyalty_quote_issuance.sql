-- Claim, hold and immutable server quote commit together. No reward IDs or
-- caller totals from HTTP are trusted; only the pricing service calls this.
-- Cancellation tombstones serialize against a quote request whose HTTP result
-- was lost. A late request cannot recreate a hold after cancellation succeeds.
create table public.loyalty_quote_cancellations (
 quote_id uuid primary key, tenant_id uuid not null references public.tenants(id) on delete cascade,
 actor uuid not null, created_at timestamptz not null default now()
);
alter table public.loyalty_quote_cancellations enable row level security;
revoke all on public.loyalty_quote_cancellations from public,anon,authenticated;
create or replace function public.issue_loyalty_pos_quote(
 p_tenant_id uuid,p_actor uuid,p_claim_hash text,p_outlet_id uuid,p_quote_id uuid,
 p_backend text,p_total_centavos bigint,p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare c loyalty_verified_claims%rowtype; e loyalty_entitlements%rowtype;
 h loyalty_reservations%rowtype; q loyalty_pos_quotes%rowtype;
 a app_users%rowtype; program loyalty_programs%rowtype; deadline timestamptz;
begin
 select * into a from app_users where user_id=p_actor and (role='superadmin' or
  (role='admin' and tenant_id=p_tenant_id and (is_owner is true or permissions is null or permissions @> array['pos','loyalty_redeem']::text[])));
 if not found then raise exception 'Forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended('loyalty-quote:'||p_quote_id::text,0));
 if exists(select 1 from loyalty_quote_cancellations where quote_id=p_quote_id) then raise exception 'Claim quote cancelled'; end if;
 if a.role<>'superadmin' and not coalesce(a.is_owner,false) and a.outlet_id is not null and a.outlet_id is distinct from p_outlet_id then raise exception 'Forbidden branch'; end if;
 if p_outlet_id is not null and not exists(select 1 from outlets where id=p_outlet_id and tenant_id=p_tenant_id and is_active) then raise exception 'Forbidden branch'; end if;
 if not exists(select 1 from tenants where id=p_tenant_id and loyalty_enabled and not loyalty_shadow) then raise exception 'Live loyalty is not enabled'; end if;
 if p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$' or p_quote_id is null
  or p_backend not in ('platform_supabase','convex','tenant_supabase') or p_total_centavos is null or p_total_centavos<0
  or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
  or (p_snapshot->'paymentPolicy'->>'totalCentavos')::bigint is distinct from p_total_centavos then raise exception 'Invalid quote'; end if;
 select * into c from loyalty_verified_claims where tenant_id=p_tenant_id and token_hash=p_claim_hash;
 if not found then raise exception 'Invalid claim'; end if;
 select * into e from loyalty_entitlements where id=c.entitlement_id and tenant_id=p_tenant_id;
 if not found then raise exception 'Invalid claim'; end if;
 -- Match settlement, verification and reversals: balance before reward.
 perform 1 from loyalty_balances where tenant_id=p_tenant_id and program_id=e.program_id and customer_key=e.customer_key for update;
 select * into e from loyalty_entitlements where id=e.id for update;
 select * into c from loyalty_verified_claims where id=c.id for update;
 if c.used_at is not null then
  select * into q from loyalty_pos_quotes where id=p_quote_id and tenant_id=p_tenant_id and created_by=p_actor;
  if not found then raise exception 'Claim already used'; end if;
  select * into h from loyalty_reservations where id=q.reservation_id and token_hash=p_claim_hash;
  if not found or q.outlet_id is distinct from p_outlet_id or q.order_snapshot<>p_snapshot or q.total_centavos<>p_total_centavos or q.order_backend<>p_backend then raise exception 'Claim already used'; end if;
  if h.status<>'held' or h.expires_at<=clock_timestamp() then raise exception 'Reservation unavailable'; end if;
 else
  if c.expires_at<=clock_timestamp() or e.status not in ('issued','restored') or (e.expires_at is not null and e.expires_at<=clock_timestamp()) then raise exception 'Claim expired or unavailable'; end if;
  if (p_snapshot->>'entitlementId')::uuid is distinct from e.id then raise exception 'Invalid quote'; end if;
  select * into program from loyalty_programs where id=e.program_id and tenant_id=p_tenant_id;
  if not found or (program.scope='branch' and program.outlet_id is distinct from p_outlet_id) then raise exception 'Reward is not valid at this branch'; end if;
  deadline:=least(clock_timestamp()+interval '2 minutes',coalesce(e.expires_at,'infinity'::timestamptz));
  insert into loyalty_reservations(tenant_id,entitlement_id,token_hash,outlet_id,reserved_by,expires_at)
   values(p_tenant_id,e.id,p_claim_hash,p_outlet_id,p_actor,deadline) returning * into h;
  insert into loyalty_pos_quotes(id,tenant_id,reservation_id,customer_key,outlet_id,created_by,order_backend,total_centavos,order_snapshot,expires_at)
   values(p_quote_id,p_tenant_id,h.id,e.customer_key,p_outlet_id,p_actor,p_backend,p_total_centavos,p_snapshot,deadline) returning * into q;
  update loyalty_verified_claims set used_at=clock_timestamp() where id=c.id;
  update loyalty_entitlements set status='reserved' where id=e.id;
 end if;
 return jsonb_build_object('quoteId',q.id,'expiresAt',q.expires_at,'totalCentavos',q.total_centavos);
end $$;

create or replace function public.release_loyalty_pos_quote(p_tenant_id uuid,p_actor uuid,p_quote_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare q loyalty_pos_quotes%rowtype; e loyalty_entitlements%rowtype; h loyalty_reservations%rowtype;
begin
 if not exists(select 1 from app_users where user_id=p_actor and (role='superadmin' or (role='admin' and tenant_id=p_tenant_id and
 (is_owner is true or permissions is null or permissions @> array['pos','loyalty_redeem']::text[])))) then raise exception 'Forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended('loyalty-quote:'||p_quote_id::text,0));
 if exists(select 1 from loyalty_pos_quotes where id=p_quote_id and (tenant_id<>p_tenant_id or created_by<>p_actor)) then raise exception 'Forbidden'; end if;
 select * into q from loyalty_pos_quotes where id=p_quote_id and tenant_id=p_tenant_id and created_by=p_actor;
 if not found then
  insert into loyalty_quote_cancellations(quote_id,tenant_id,actor) values(p_quote_id,p_tenant_id,p_actor) on conflict do nothing;
  return true;
 end if;
 select * into h from loyalty_reservations where id=q.reservation_id;
 select * into e from loyalty_entitlements where id=h.entitlement_id;
 perform 1 from loyalty_balances where program_id=e.program_id and customer_key=e.customer_key for update;
 select * into e from loyalty_entitlements where id=e.id for update;
 select * into h from loyalty_reservations where id=q.reservation_id for update;
 if h.status in ('released','expired') then return true; end if;
 if h.status<>'held' then return false; end if;
 update loyalty_reservations set status='released' where id=h.id;
 update loyalty_entitlements set status=case when expires_at<=clock_timestamp() then 'expired' else 'issued' end where id=e.id and status='reserved';
 return true;
end $$;
revoke all on function public.issue_loyalty_pos_quote(uuid,uuid,text,uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.release_loyalty_pos_quote(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.issue_loyalty_pos_quote(uuid,uuid,text,uuid,uuid,text,bigint,jsonb) to service_role;
grant execute on function public.release_loyalty_pos_quote(uuid,uuid,uuid) to service_role;
