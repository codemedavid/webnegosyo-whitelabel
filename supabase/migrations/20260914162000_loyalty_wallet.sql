-- Public lookup quotas are shared across server instances. Store keyed hashes
-- only, separately from OTP quotas, with no customer-profile writes.
create table public.loyalty_lookup_rate_events (
 id bigint generated always as identity primary key,
 tenant_id uuid not null, phone_hash text not null, ip_hash text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index loyalty_lookup_ip_idx on public.loyalty_lookup_rate_events(ip_hash,created_at desc);
create index loyalty_lookup_tenant_idx on public.loyalty_lookup_rate_events(tenant_id,created_at desc);
create index loyalty_lookup_phone_idx on public.loyalty_lookup_rate_events(tenant_id,phone_hash,created_at desc);
alter table public.loyalty_lookup_rate_events enable row level security;
revoke all on public.loyalty_lookup_rate_events from public,anon,authenticated,service_role;

create or replace function public.lookup_loyalty_wallet(p_tenant_id uuid,p_customer_key text,p_phone_hash text,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t timestamptz; programs jsonb; rewards jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' or p_tenant_id is null
  or p_customer_key is null or p_customer_key !~ '^phone:\+639[0-9]{9}$'
  or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$'
  or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
  return jsonb_build_object('ok',false,'error','invalid_request');
 end if;
 perform pg_advisory_xact_lock(18708,hashtext(p_ip_hash));
 perform pg_advisory_xact_lock(18709,hashtext(p_tenant_id::text));
 t:=clock_timestamp();
 if (select count(*) from loyalty_lookup_rate_events where tenant_id=p_tenant_id and created_at>t-interval '1 minute')>=120
 or (select count(*) from loyalty_lookup_rate_events where ip_hash=p_ip_hash and created_at>t-interval '1 minute')>=10
 or (select count(*) from loyalty_lookup_rate_events where ip_hash=p_ip_hash and created_at>t-interval '24 hours')>=200
 or (select count(*) from loyalty_lookup_rate_events where tenant_id=p_tenant_id and phone_hash=p_phone_hash and created_at>t-interval '15 minutes')>=20 then
  return jsonb_build_object('ok',false,'error','rate_limited');
 end if;
 insert into loyalty_lookup_rate_events(tenant_id,phone_hash,ip_hash,created_at) values(p_tenant_id,p_phone_hash,p_ip_hash,t);
 if not exists(select 1 from tenants where id=p_tenant_id and loyalty_enabled and not loyalty_shadow) then
  return jsonb_build_object('ok',true,'programs','[]'::jsonb,'rewards','[]'::jsonb);
 end if;
 perform expire_loyalty_reservations(p_tenant_id);
 select coalesce(jsonb_agg(row),'[]'::jsonb) into programs from (
  select p.id,p.name,p.status,p.scope,o.name as "branchName",v.rules,
   coalesce(b.balance,0) as balance
  from loyalty_programs p join loyalty_program_versions v on v.id=p.current_version_id and v.tenant_id=p_tenant_id
  left join loyalty_balances b on b.program_id=p.id and b.tenant_id=p_tenant_id and b.customer_key=p_customer_key
  left join outlets o on o.id=p.outlet_id and o.tenant_id=p_tenant_id
  where p.tenant_id=p_tenant_id and p.status in ('active','paused')
   and (p.activates_at is null or p.activates_at<=t) and (p.ends_at is null or p.ends_at>t)
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
 return jsonb_build_object('ok',true,'programs',programs,'rewards',rewards);
end $$;
revoke all on function public.lookup_loyalty_wallet(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.lookup_loyalty_wallet(uuid,text,text,text) to service_role;
