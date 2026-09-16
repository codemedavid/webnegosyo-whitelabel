-- Capture earning rules at the canonical settlement, so delayed destination
-- sync cannot use a later revision or lose earning when a program is paused.
create or replace function public.freeze_loyalty_settlement_earning()
returns trigger language plpgsql security definer set search_path=public as $$
declare programs jsonb;
begin
 perform 1 from loyalty_programs where tenant_id=new.tenant_id and status='active' order by id for share;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'tenantId',p.tenant_id,'name',p.name,'scope',p.scope,'outletId',p.outlet_id,'status',p.status,
  'activatesAt',p.activates_at,'endsAt',p.ends_at,
  'version',jsonb_build_object('id',v.id,'version',v.version,'rules',v.rules,'createdAt',v.created_at)
 ) order by p.id),'[]'::jsonb) into programs from loyalty_programs p
 join loyalty_program_versions v on v.id=p.current_version_id and v.program_id=p.id
 where p.tenant_id=new.tenant_id and p.status='active';
 new.order_snapshot:=new.order_snapshot||jsonb_build_object('earningPrograms',programs);
 return new;
end $$;
revoke all on function public.freeze_loyalty_settlement_earning() from public,anon,authenticated;
create trigger freeze_loyalty_settlement_earning before insert on public.loyalty_pos_settlements
 for each row execute function public.freeze_loyalty_settlement_earning();
