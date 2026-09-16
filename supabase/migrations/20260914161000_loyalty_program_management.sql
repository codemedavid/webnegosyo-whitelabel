-- One transaction owns a program and its current immutable rules. Serializes
-- revisions/status changes; stale editors cannot overwrite a newer version.
create or replace function public.manage_loyalty_program(
 p_tenant_id uuid, p_actor uuid, p_action text, p_program_id uuid,
 p_input jsonb, p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 program public.loyalty_programs%rowtype;
 rules jsonb := p_input->'rules';
 version_id uuid;
 version_number integer;
 next_status text := p_input->>'status';
 branch uuid;
begin
 if not exists(select 1 from app_users where user_id=p_actor and
  (role='superadmin' or (role='admin' and tenant_id=p_tenant_id and
    (is_owner is true or permissions is null or 'loyalty_manage'=any(permissions))))) then
  raise exception 'Forbidden';
 end if;
 if p_action in ('create','revise') then
  -- Full field validation belongs to the trusted HTTP service. These checks
  -- prevent incomplete drafts even if another server caller omits the rules.
  if rules is null or jsonb_typeof(rules)<>'object'
   or coalesce(rules->>'earnMode','') not in ('stamp','points')
   or coalesce(jsonb_typeof(rules->'threshold'),'')<>'number'
   or (rules->>'threshold')::numeric<=0
   or coalesce(rules->'reward'->>'type','') not in ('fixed','percent','free_item') then
   raise exception 'Valid reward rules are required';
  end if;
 end if;
 if p_action='create' then
  if length(trim(coalesce(p_input->>'name',''))) not between 1 and 80 then raise exception 'A program name is required'; end if;
  if coalesce(p_input->>'scope','business') not in ('business','branch') then raise exception 'Invalid scope'; end if;
  if p_input->>'scope'='branch' then
   branch := (p_input->>'outletId')::uuid;
   if not exists(select 1 from outlets where id=branch and tenant_id=p_tenant_id and is_active) then raise exception 'Choose an active branch from this store'; end if;
  end if;
  if nullif(p_input->>'endsAt','')::timestamptz <= greatest(clock_timestamp(),nullif(p_input->>'activatesAt','')::timestamptz) then raise exception 'The end must be after activation'; end if;
  insert into loyalty_programs(tenant_id,name,description,earn_mode,scope,outlet_id,created_by,activates_at,ends_at)
   values(p_tenant_id,trim(p_input->>'name'),p_input->>'description',rules->>'earnMode',coalesce(p_input->>'scope','business'),branch,p_actor,nullif(p_input->>'activatesAt','')::timestamptz,nullif(p_input->>'endsAt','')::timestamptz)
   returning * into program;
  version_number := 1;
 else
  select * into program from loyalty_programs where id=p_program_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Program not found'; end if;
  if program.status='ended' then raise exception 'An ended program cannot be changed'; end if;
  if p_action='revise' then
   select version into version_number from loyalty_program_versions where id=program.current_version_id;
   if p_expected_version is distinct from version_number then raise exception 'Program changed. Reload before editing'; end if;
   if program.earn_mode<>rules->>'earnMode' then raise exception 'A program cannot change between stamps and points'; end if;
   select coalesce(max(version),0)+1 into version_number from loyalty_program_versions where program_id=program.id;
  elsif p_action='set_status' then
   if p_input->>'expectedStatus' is distinct from program.status then raise exception 'Program changed. Reload before editing'; end if;
   if not ((program.status='draft' and next_status in ('active','ended')) or
     (program.status='active' and next_status in ('paused','ended')) or
     (program.status='paused' and next_status in ('active','ended'))) then raise exception 'Invalid status transition'; end if;
   if next_status='active' and program.ends_at<=clock_timestamp() then raise exception 'The scheduled end has passed'; end if;
   if next_status='active' and program.current_version_id is null then raise exception 'Set reward rules before activating'; end if;
   update loyalty_programs set status=next_status,
    activates_at=case when next_status='active' then case when status='draft' then greatest(coalesce(activates_at,clock_timestamp()),clock_timestamp()) else coalesce(activates_at,clock_timestamp()) end else activates_at end,
    ends_at=case when next_status='ended' then clock_timestamp() else ends_at end where id=program.id;
   return jsonb_build_object('status',next_status);
  else raise exception 'Invalid management action'; end if;
 end if;
 insert into loyalty_program_versions(tenant_id,program_id,version,rules,created_by)
  values(p_tenant_id,program.id,version_number,rules,p_actor) returning id into version_id;
 update loyalty_programs set current_version_id=version_id where id=program.id;
 return jsonb_build_object('programId',program.id,'versionId',version_id,'version',version_number);
end $$;
revoke all on function public.manage_loyalty_program(uuid,uuid,text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.manage_loyalty_program(uuid,uuid,text,uuid,jsonb,integer) to service_role;
