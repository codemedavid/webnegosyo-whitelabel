-- Expired holds must not strand a reward. Also invoked during wallet lookup,
-- so a customer need not wait for the maintenance schedule to claim again.
create or replace function public.expire_loyalty_reservations(p_tenant_id uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare candidate record; reward loyalty_entitlements%rowtype; hold loyalty_reservations%rowtype; released integer:=0;
begin
 for candidate in select r.id,r.entitlement_id from loyalty_reservations r
  where r.status='held' and r.expires_at<=clock_timestamp() and (p_tenant_id is null or r.tenant_id=p_tenant_id)
  order by r.expires_at,r.id limit 250
 loop
  select * into reward from loyalty_entitlements where id=candidate.entitlement_id;
  perform 1 from loyalty_balances where program_id=reward.program_id and customer_key=reward.customer_key for update;
  select * into reward from loyalty_entitlements where id=candidate.entitlement_id for update;
  select * into hold from loyalty_reservations where id=candidate.id for update;
  if hold.status='held' and hold.expires_at<=clock_timestamp() then
   update loyalty_reservations set status='expired' where id=hold.id;
   update loyalty_entitlements set status=case when expires_at<=clock_timestamp() then 'expired' else 'issued' end
    where id=reward.id and status='reserved';
   released:=released+1;
  end if;
 end loop;
 return released;
end $$;
revoke all on function public.expire_loyalty_reservations(uuid) from public,anon,authenticated;
grant execute on function public.expire_loyalty_reservations(uuid) to service_role;

create or replace function public.cleanup_loyalty_data()
returns jsonb language plpgsql security definer set search_path=public as $$
declare released integer; table_name text;
begin
 released:=expire_loyalty_reservations(null);
 -- Every quota window is at most 24 hours; keep a full extra day of margin.
 foreach table_name in array array['loyalty_lookup_rate_events','loyalty_verification_rate_events','loyalty_issuance_rate_events'] loop
  if to_regclass('public.'||table_name) is not null then
   execute format('delete from public.%I where id in (select id from public.%I where created_at<clock_timestamp()-interval ''48 hours'' order by created_at limit 5000)',table_name,table_name);
  end if;
 end loop;
 -- Any claim is long expired before a cancellation tombstone is removed.
 delete from loyalty_quote_cancellations where quote_id in (
  select quote_id from loyalty_quote_cancellations where created_at<clock_timestamp()-interval '48 hours' order by created_at limit 1000
 );
 -- Never erase an uncertain dispatch or its recovery evidence.
 delete from loyalty_otp_challenges where id in (
  select c.id from loyalty_otp_challenges c where c.expires_at<clock_timestamp()-interval '7 days'
   and not exists(select 1 from loyalty_sms_outbox j where j.challenge_id=c.id and j.status='claimed')
  order by c.expires_at limit 1000
 );
 return jsonb_build_object('expiredReservations',released);
end $$;
revoke all on function public.cleanup_loyalty_data() from public,anon,authenticated;
grant execute on function public.cleanup_loyalty_data() to service_role;
