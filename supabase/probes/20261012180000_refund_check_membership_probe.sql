-- Probe for 20261012180000_refund_check_membership.sql. ONE transaction, ends
-- in ROLLBACK. RAISEs on the first failure.
--
-- Fixtures (real platform rows):
--   tenant    0dd96b60-5232-4c79-922b-0bd9022d12ba  Gungjeon Unlimited
--   staff     e11c4862-c00e-4508-98fe-8946582f1585  Gungjeon, holds order_refund
--   outsider  6fb0bddc…  staff D of tenant 7dbec857 (Phase 0 probe), looked up by prefix
--
-- Asserts:
--  1. an outsider calling the check over RPC gets no answer (no over-refund
--     error, no approval error) for another store's order;
--  2. the store's own staff is still refused an over-refund, and is held to
--     the client limits even when passing p_is_client = false;
--  3. a within-limit register refund still goes through.

begin;

do $$
declare
  c_tenant constant uuid := '0dd96b60-5232-4c79-922b-0bd9022d12ba';
  c_staff constant uuid := 'e11c4862-c00e-4508-98fe-8946582f1585';
  v_outsider uuid;
  v_order uuid := gen_random_uuid();
begin
  -- The outsider: staff D of the Phase 0 probe (user 6fb0bddc…), a different store.
  select au.user_id into v_outsider from public.app_users au
   where au.user_id::text like '6fb0bddc%' and au.tenant_id <> c_tenant
   limit 1;
  if v_outsider is null then
    raise exception 'PROBE SETUP: outsider fixture 6fb0bddc… not found';
  end if;

  insert into public.orders (id, tenant_id, customer_name, total, status, payment_status, source, payment_method_name, created_at)
  values (v_order, c_tenant, 'Probe Customer', 480, 'delivered', 'paid', 'pos', 'Cash', now() - interval '10 minutes');
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name, recorded_by, created_at)
  values (c_tenant, v_order, 'charge', 480, 'Cash', c_staff, now() - interval '10 minutes');

  -- 1. Outsider: silence.
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.order_refund_insert_check(v_order, 100000, false);
  perform public.order_refund_insert_check(v_order, 400, true);
  reset role;

  -- 2. Own staff: over-refund refused; client limits even with p_is_client = false.
  perform set_config('request.jwt.claims', json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.order_refund_insert_check(v_order, 100000, false);
    raise exception 'PROBE FAIL 2: over-refund not refused for own staff';
  exception when check_violation then null;
  end;
  begin
    perform public.order_refund_insert_check(v_order, 400, false);
    raise exception 'PROBE FAIL 2: p_is_client = false skipped the client limits';
  exception when insufficient_privilege then null;
  end;

  -- 3. Within the limit, the register's own refund row still goes through.
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name)
  values (c_tenant, v_order, 'refund', 10, 'Cash');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (select amount_paid from public.orders where id = v_order) <> 470 then
    raise exception 'PROBE FAIL 3: the within-limit refund did not land';
  end if;
  raise notice 'PASS: outsider gets no answer; own staff refused over-refund and held to limits; register refund works';
end;
$$;

rollback;
