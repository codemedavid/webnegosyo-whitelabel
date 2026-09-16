-- Recovery reschedules the same paid receipt; it cannot change reward/tender.
alter table public.loyalty_pos_projection_jobs add column last_retry_by uuid;
alter table public.loyalty_pos_projection_jobs add column last_retry_at timestamptz;
create or replace function public.retry_loyalty_pos_projection(p_tenant_id uuid,p_actor uuid,p_job_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
 if not exists(select 1 from app_users where user_id=p_actor and (role='superadmin' or (role='admin' and tenant_id=p_tenant_id and
  (is_owner is true or permissions is null or permissions @> array['loyalty_manage']::text[])))) then raise exception 'Forbidden'; end if;
 update loyalty_pos_projection_jobs set status='pending',attempts=0,available_at=clock_timestamp(),
  lease_token=null,lease_expires_at=null,last_retry_by=p_actor,last_retry_at=clock_timestamp()
  where id=p_job_id and tenant_id=p_tenant_id and status='failed';
 get diagnostics affected=row_count;
 return affected=1;
end $$;
revoke all on function public.retry_loyalty_pos_projection(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_loyalty_pos_projection(uuid,uuid,uuid) to service_role;
