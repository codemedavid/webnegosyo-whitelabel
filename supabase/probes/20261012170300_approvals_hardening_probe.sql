-- Probe for 20261012170300_approvals_hardening.sql. ONE transaction, ends in
-- ROLLBACK. RAISEs on the first failure; NOTICEs on passes. Run after
-- 20261012140000, 20261012150000..152000, 20261012160000 and 20261012170000
-- are applied, as the postgres / service owner.
--
-- Fixture ids (real platform rows, picked 2026-10-13 by SELECT):
--   tenant   0dd96b60-5232-4c79-922b-0bd9022d12ba  Gungjeon Unlimited (platform)
--   owner    6e6a5bec-43ad-45fe-b39a-3cfeaba42d60  is_owner
--   staff    e11c4862-c00e-4508-98fe-8946582f1585  store-wide: pos, orders, order_refund (no approve_requests)
--   manager  12b8a1a6-3516-41fc-881a-599165b9c5c2  given approve_requests + store-wide reach HERE (rolled back)
--   branch   44d0cfdb-6fee-4e79-9e72-50a46fa56a9e
--   item     8995a367-c7bd-439c-82a2-121c5513a348  an inventory item; its cost is zeroed here (rolled back)
-- Orders, lines, payments and the staff's drawer are created here.
--
-- Asserts: H1 (register refund rows: caps, cumulative, exact refusal text,
-- over-refund for every role, owner unlimited), H2 (order-cumulative direct
-- cap), H3 (discount refused), M1 (cost-unknown write-off never direct), M2
-- (idempotency conflict), M3 (unknown implicit tender = cash), M4 (item
-- value scaled by the order's discount), M5 (a fresh execution is not
-- claimed by the sweep), M6 (over-limit manager declines, cannot approve),
-- L6 (approving a cash refund needs the requester's open drawer), B1 (refund
-- of an overpaid balance: no revision, total untouched, capped at the overpayment).

begin;

do $$
declare
  c_tenant constant uuid := '0dd96b60-5232-4c79-922b-0bd9022d12ba';
  c_owner constant uuid := '6e6a5bec-43ad-45fe-b39a-3cfeaba42d60';
  c_staff constant uuid := 'e11c4862-c00e-4508-98fe-8946582f1585';
  c_manager constant uuid := '12b8a1a6-3516-41fc-881a-599165b9c5c2';
  c_branch constant uuid := '44d0cfdb-6fee-4e79-9e72-50a46fa56a9e';
  c_item constant uuid := '8995a367-c7bd-439c-82a2-121c5513a348';
  c_needs_approval constant text := 'This refund needs approval. Ask a manager to approve it.';
  v_branch uuid;
  v_shift uuid;
  v_order uuid := gen_random_uuid();
  v_order2 uuid := gen_random_uuid();
  v_order3 uuid := gen_random_uuid();
  v_line uuid := gen_random_uuid();
  v_order4 uuid := gen_random_uuid();
  v_revisions integer;
  v_out jsonb;
  v_req uuid;
  v_state text;
  v_msg text;
begin
  -- Fixtures ------------------------------------------------------------------
  select s.id, s.outlet_id into v_shift, v_branch from public.staff_shifts s
   where s.tenant_id = c_tenant and s.staff_user_id = c_staff and s.status = 'open' limit 1;
  if v_shift is null then
    v_branch := c_branch;
    insert into public.staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, status, opening_float, opened_at)
    values (c_tenant, v_branch, c_staff, 'Probe cashier', 'open', 0, now() - interval '1 hour')
    returning id into v_shift;
  end if;
  update public.app_users
     set permissions = array_append(coalesce(permissions, '{}'::text[]), 'approve_requests'), outlet_id = null
   where user_id = c_manager;

  -- Order 1: ₱480 cash, paid today, one ledger charge.
  insert into public.orders (id, tenant_id, outlet_id, customer_name, total, status, payment_status, source, payment_method_name, created_at)
  values (v_order, c_tenant, v_branch, 'Probe Customer', 480, 'delivered', 'paid', 'pos', 'Cash', now() - interval '10 minutes');
  insert into public.order_items (order_id, menu_item_name, quantity, price, subtotal) values (v_order, 'Probe Sisig', 2, 240, 480);
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name, recorded_by, created_at)
  values (c_tenant, v_order, 'charge', 480, 'Cash', c_staff, now() - interval '10 minutes');

  -- H1 ------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name)
  values (c_tenant, v_order, 'refund', 10, 'Cash');                       -- within ₱300, same day: allowed
  begin
    insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name)
    values (c_tenant, v_order, 'refund', 295, 'Cash');                    -- 10 + 295 > 300 on this order
    raise exception 'PROBE FAIL H1: a split refund past the cap was accepted';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> c_needs_approval then
      raise exception 'PROBE FAIL H1: wrong refusal text: %', v_msg;
    end if;
  end;
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name)
  values (c_tenant, v_order, 'refund', 290, 'Cash');                      -- 10 + 290 = 300: allowed
  reset role;
  if (select amount_paid from public.orders where id = v_order) <> 180 then
    raise exception 'PROBE FAIL H1: amount_paid should be 180 after ₱300 of register refunds';
  end if;

  -- Over-refund is refused for every role, the server included.
  begin
    insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name)
    values (c_tenant, v_order, 'refund', 181, 'Cash');
    raise exception 'PROBE FAIL H1: an over-refund was accepted from the server';
  exception when check_violation then null;
  end;
  -- The owner (client role) is not capped, only bounded by what was paid.
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name)
  values (c_tenant, v_order, 'refund', 180, 'Cash');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'PASS H1: register refunds capped cumulatively with the exact refusal text; over-refund refused for all; owner bounded only by what was paid';

  -- H2 ------------------------------------------------------------------------
  if public.approval_direct_allowed(c_tenant, c_staff, 'refund', 1, now(), null, v_order::text) then
    raise exception 'PROBE FAIL H2: a direct refund was allowed on an order already refunded ₱480';
  end if;
  raise notice 'PASS H2: the direct cap is per order, not per request';

  -- Order 2: ₱432 (₱480 of lines, 10%% order discount), cash charge.
  insert into public.orders (id, tenant_id, outlet_id, customer_name, total, status, payment_status, source, payment_method_name, created_at,
                             discount_total)
  values (v_order2, c_tenant, v_branch, 'Probe Two', 432, 'delivered', 'paid', 'pos', 'Cash', now() - interval '10 minutes', 48);
  insert into public.order_items (id, order_id, menu_item_name, quantity, price, subtotal) values (v_line, v_order2, 'Probe Adobo', 1, 240, 240);
  insert into public.order_items (order_id, menu_item_name, quantity, price, subtotal) values (v_order2, 'Probe Rice', 1, 240, 240);
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name, recorded_by, created_at)
  values (c_tenant, v_order2, 'charge', 432, 'Cash', c_staff, now() - interval '10 minutes');

  -- M4 ------------------------------------------------------------------------
  v_out := public.approval_quote(c_tenant, c_staff, 'refund', v_order2::text,
    jsonb_build_object('scope', 'items', 'lines', jsonb_build_array(jsonb_build_object('orderItemId', v_line, 'quantity', 1))));
  if (v_out ->> 'amount')::numeric <> 216 then
    raise exception 'PROBE FAIL M4: item value should be ₱216 (₱240 × 432/480), got %', v_out ->> 'amount';
  end if;
  raise notice 'PASS M4: item refunds share the order discount';

  -- M2 ------------------------------------------------------------------------
  v_out := public.create_approval_request(c_tenant, c_staff, 'refund', v_order2::text,
    jsonb_build_object('scope', 'amount', 'amount', 400), 'wrong_item', null, 'probe_hard_0001', false);
  v_req := (v_out -> 'request' ->> 'id')::uuid;
  if (v_out -> 'request' ->> 'status') <> 'pending' then
    raise exception 'PROBE FAIL M2: setup request not pending: %', v_out;
  end if;
  if public.create_approval_request(c_tenant, c_staff, 'refund', v_order2::text,
       jsonb_build_object('scope', 'amount', 'amount', 401), 'wrong_item', null, 'probe_hard_0001', false) ->> 'code'
     <> 'idempotency_conflict' then
    raise exception 'PROBE FAIL M2: a changed replay was not refused';
  end if;
  if not coalesce((public.create_approval_request(c_tenant, c_staff, 'refund', v_order2::text,
       jsonb_build_object('scope', 'amount', 'amount', 400), 'wrong_item', null, 'probe_hard_0001', false) ->> 'replayed')::boolean, false) then
    raise exception 'PROBE FAIL M2: an identical replay was not handed back';
  end if;
  raise notice 'PASS M2: changed replay → idempotency_conflict; identical replay → replayed';

  -- M6 ------------------------------------------------------------------------
  perform public.set_approval_rules(c_tenant, c_owner, jsonb_build_object('managerApproveCap', 100));
  if public.decide_approval(v_req, c_tenant, c_manager, 'approve') ->> 'code' <> 'over_limit' then
    raise exception 'PROBE FAIL M6: an over-limit manager approved';
  end if;
  v_out := public.decide_approval(v_req, c_tenant, c_manager, 'decline', 'talk_first', null);
  if (v_out -> 'request' ->> 'status') <> 'declined' then
    raise exception 'PROBE FAIL M6: an over-limit manager could not decline: %', v_out;
  end if;
  perform public.set_approval_rules(c_tenant, c_owner, jsonb_build_object('managerApproveCap', 1000));
  raise notice 'PASS M6: over-limit manager declines, cannot approve';

  -- L6 ------------------------------------------------------------------------
  v_out := public.create_approval_request(c_tenant, c_staff, 'refund', v_order2::text,
    jsonb_build_object('scope', 'amount', 'amount', 50), 'took_too_long', null, 'probe_hard_0002', false);
  v_req := (v_out -> 'request' ->> 'id')::uuid;
  -- protect_staff_shift_custody: a close must carry expected + counted cash.
  update public.staff_shifts set status = 'closed', closed_at = now(), expected_cash = 0, closing_count = 0
   where id = v_shift;
  v_out := public.decide_approval(v_req, c_tenant, c_owner, 'approve');
  if v_out ->> 'code' <> 'no_open_shift' then
    raise exception 'PROBE FAIL L6: approving a cash refund without the requester''s drawer: %', v_out;
  end if;
  select status into v_state from public.approval_requests where id = v_req;
  if v_state <> 'pending' then
    raise exception 'PROBE FAIL L6: the refusal moved the request to %', v_state;
  end if;
  raise notice 'PASS L6: refused before the CAS; the request is still pending';

  -- H3 ------------------------------------------------------------------------
  if public.create_approval_request(c_tenant, c_staff, 'discount', v_order2::text,
       jsonb_build_object('amountOff', 100, 'pct', 25), 'make_up', null, 'probe_hard_0003', false) ->> 'code' <> 'not_supported' then
    raise exception 'PROBE FAIL H3: a discount request was accepted';
  end if;
  raise notice 'PASS H3: discount requests refused';

  -- M1 ------------------------------------------------------------------------
  update public.inventory_items set unit_cost = 0 where id = c_item and tenant_id = c_tenant;
  if found then
    v_out := public.create_and_execute_approval(c_tenant, c_owner, 'stock_writeoff', null,
      jsonb_build_object('inventoryItemId', c_item, 'quantity', 2), 'spoiled', null, 'probe_hard_0004');
    if v_out ->> 'code' <> 'cost_unknown' then
      raise exception 'PROBE FAIL M1: a cost-unknown write-off went direct: %', v_out;
    end if;
    raise notice 'PASS M1: cost-unknown write-off refused as direct (even for the owner)';
  else
    raise notice 'SKIP M1: fixture item not found';
  end if;

  -- M3 ------------------------------------------------------------------------
  -- Order 3: paid by status only, no ledger rows, no method recorded.
  insert into public.orders (id, tenant_id, outlet_id, customer_name, total, status, payment_status, source, created_at)
  values (v_order3, c_tenant, v_branch, 'Probe Three', 150, 'delivered', 'paid', 'pos', now() - interval '5 minutes');
  insert into public.order_items (order_id, menu_item_name, quantity, price, subtotal) values (v_order3, 'Probe Halo-halo', 1, 150, 150);
  v_out := public.approval_quote(c_tenant, c_staff, 'refund', v_order3::text, jsonb_build_object('scope', 'whole'));
  if not coalesce((v_out ->> 'cashInvolved')::boolean, false) then
    raise exception 'PROBE FAIL M3: an unknown implicit tender was not treated as cash: %', v_out;
  end if;
  raise notice 'PASS M3: unknown implicit tender counts as cash';

  -- M5 ------------------------------------------------------------------------
  -- Re-open a drawer and execute a direct refund; a FRESH execution is not claimed.
  insert into public.staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, status, opening_float, opened_at)
  values (c_tenant, v_branch, c_staff, 'Probe cashier', 'open', 0, now());
  v_out := public.create_and_execute_approval(c_tenant, c_staff, 'refund', v_order3::text,
    jsonb_build_object('scope', 'amount', 'amount', 20), 'took_too_long', null, 'probe_hard_0005');
  if (v_out -> 'request' ->> 'status') <> 'executed' then
    raise exception 'PROBE FAIL M5: setup direct refund did not execute: %', v_out;
  end if;
  if exists (select 1 from public.claim_approval_side_effects(c_tenant, 100) c where c.id = (v_out -> 'request' ->> 'id')::uuid) then
    raise exception 'PROBE FAIL M5: a fresh execution was claimed by the sweep';
  end if;
  -- The implicit ledger got its opening charge, so the refund nets against it.
  if (select amount_paid from public.orders where id = v_order3) <> 130 then
    raise exception 'PROBE FAIL M5: implicit-ledger refund should leave amount_paid 130';
  end if;
  raise notice 'PASS M5: the sweep leaves fresh executions alone';

  -- B1 ------------------------------------------------------------------------
  -- Order 4: ₱300 paid in cash, then an edit lowered the total to ₱200 (the
  -- register's refund row having been refused) → ₱100 overpaid.
  insert into public.orders (id, tenant_id, outlet_id, customer_name, total, status, payment_status, source, payment_method_name, created_at)
  values (v_order4, c_tenant, v_branch, 'Probe Four', 300, 'delivered', 'paid', 'pos', 'Cash', now() - interval '5 minutes');
  insert into public.order_items (order_id, menu_item_name, quantity, price, subtotal) values (v_order4, 'Probe Lechon', 1, 200, 200);
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name, recorded_by, created_at)
  values (c_tenant, v_order4, 'charge', 300, 'Cash', c_staff, now() - interval '5 minutes');
  if public.approval_quote(c_tenant, c_staff, 'refund', v_order4::text, jsonb_build_object('scope', 'balance')) ->> 'code'
     <> 'nothing_to_refund' then
    raise exception 'PROBE FAIL B1: a balance refund was quoted on an order that is not overpaid';
  end if;
  update public.orders set total = 200 where id = v_order4;
  if public.approval_quote(c_tenant, c_staff, 'refund', v_order4::text, jsonb_build_object('scope', 'balance', 'amount', 100.01)) ->> 'code'
     <> 'over_refund' then
    raise exception 'PROBE FAIL B1: more than the overpaid balance was quoted';
  end if;
  select count(*) into v_revisions from public.order_revisions where order_id = v_order4;
  v_out := public.create_and_execute_approval(c_tenant, c_staff, 'refund', v_order4::text,
    jsonb_build_object('scope', 'balance'), 'charged_twice', null, 'probe_hard_0006');
  if (v_out -> 'request' ->> 'status') <> 'executed' or (v_out -> 'result' ->> 'amount')::numeric <> 100
     or (v_out -> 'result' ->> 'scope') <> 'balance' then
    raise exception 'PROBE FAIL B1: balance refund did not execute for ₱100: %', v_out;
  end if;
  if (select total from public.orders where id = v_order4) <> 200
     or (select amount_paid from public.orders where id = v_order4) <> 200
     or (select revision_number from public.orders where id = v_order4) <> 0
     or (select count(*) from public.order_revisions where order_id = v_order4) <> v_revisions then
    raise exception 'PROBE FAIL B1: a balance refund changed the total / revision, or amount_paid is not 200';
  end if;
  if not exists (select 1 from public.order_refunds f
                  where f.order_id = v_order4::text and f.scope = 'balance' and f.amount = 100 and f.revision_id is null)
     or not exists (select 1 from public.order_payments p
                     where p.order_id = v_order4 and p.kind = 'refund' and p.amount = 100 and p.recorded_by = c_staff)
     or not exists (select 1 from public.store_activity a
                     where a.event_key = 'order_refunds:' || (v_out -> 'result' ->> 'refundId') and a.kind = 'refund.issued') then
    raise exception 'PROBE FAIL B1: balance refund records missing';
  end if;
  raise notice 'PASS B1: ₱100 overpaid balance refunded; total, lines and revision untouched; refund.issued written';
end;
$$;

rollback;
