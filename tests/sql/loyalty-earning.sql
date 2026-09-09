-- Run through run-loyalty-earning.cjs against an isolated in-memory database.
do $$
declare
  t uuid := gen_random_uuid();
  p uuid := gen_random_uuid();
  v uuid := gen_random_uuid();
  result jsonb;
  actual numeric;
begin
  insert into loyalty_programs values (p, t);
  insert into loyalty_program_versions values (v, '{"threshold":10}');
  perform apply_loyalty_earning(t,p,v,'phone:original',null,'earn',9,'convex','first',10,'{}',null,false);
  perform apply_loyalty_earning(t,p,v,'phone:original',null,'earn',1,'convex','crossing',10,'{}',null,false);
  result := apply_loyalty_earning(t,p,v,'phone:original',null,'reverse',-1,'convex','crossing',null,null,null,false);
  if (result->>'balance')::numeric <> 9 then
    raise exception 'Voiding an unclaimed reward must restore its spent threshold: expected 9, got %', result->>'balance';
  end if;
  if exists(select from loyalty_entitlements where status <> 'voided') then
    raise exception 'Reward from reversed order is still available';
  end if;
  result := apply_loyalty_earning(t,p,v,'phone:original',null,'reverse',-1,'convex','crossing',null,null,null,false);
  if result->>'reason' <> 'duplicate' then raise exception 'Reversal replay was not idempotent'; end if;
  result := apply_loyalty_earning(t,p,v,'phone:original',null,'earn',1,'convex','crossing',10,'{}',null,false);
  if result->>'reason' <> 'duplicate' then raise exception 'Uncancelled order earned twice'; end if;

  perform apply_loyalty_earning(t,p,v,'phone:original',null,'earn',1,'convex','held-crossing',10,'{}',null,false);
  insert into loyalty_reservations(tenant_id,entitlement_id)
    select t,id from loyalty_entitlements where status = 'issued';
  update loyalty_entitlements set status = 'reserved' where status = 'issued';
  result := apply_loyalty_earning(t,p,v,'phone:original',null,'reverse',-1,'convex','held-crossing',null,null,null,false);
  if (result->>'balance')::numeric <> 9 or exists(select from loyalty_reservations where status='held')
      or exists(select from loyalty_entitlements where status='reserved') then
    raise exception 'Reserved reward was not voided, released, and credited correctly';
  end if;

  perform apply_loyalty_earning(t,p,v,'phone:original',null,'earn',1,'convex','spent-crossing',10,'{}',null,false);
  update loyalty_entitlements set status = 'consumed' where status = 'issued';
  result := apply_loyalty_earning(t,p,v,'phone:original',null,'reverse',-1,'convex','spent-crossing',null,null,null,false);
  if (result->>'balance')::numeric <> -1 then raise exception 'Consumed reward must retain its threshold cost'; end if;

  perform apply_loyalty_earning(t,p,v,'phone:shadow',null,'earn',12,'convex','shadow-order',10,'{}',null,true);
  perform apply_loyalty_earning(t,p,v,'phone:changed',null,'reverse',-999,'convex','shadow-order',null,null,null,false);
  if exists(select from loyalty_balances where customer_key in ('phone:shadow','phone:changed')) then
    raise exception 'Reversing original shadow credit changed a live balance';
  end if;
  if not exists(select from loyalty_ledger where external_order_id='shadow-order' and kind='reverse'
      and is_shadow and customer_key='phone:shadow' and delta=-12 and version_id=v) then
    raise exception 'Reversal lost original attribution';
  end if;
end $$;
