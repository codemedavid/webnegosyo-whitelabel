-- Probe for 20261012160000_approvals.sql. ONE transaction, ends in ROLLBACK:
-- nothing it writes survives. RAISEs on the first failure; NOTICEs on passes.
-- Run after 20261012140000, 20261012150000..152000 AND 20261012160000 are
-- applied, as the postgres / service owner (Supabase SQL editor or MCP).
--
-- Fixture ids (real platform rows, picked 2026-10-12 by SELECT):
--   tenant  0dd96b60-5232-4c79-922b-0bd9022d12ba  Gungjeon Unlimited (order_backend = 'platform')
--   owner   6e6a5bec-43ad-45fe-b39a-3cfeaba42d60  is_owner admin
--   staff   e11c4862-c00e-4508-98fe-8946582f1585  store-wide admin: pos, orders, order_refund, order_edit, menu… (no approve_requests)
--   branch  44d0cfdb-6fee-4e79-9e72-50a46fa56a9e  a branch of the store
-- The order, its line, its cash charge and the staff's open drawer are
-- created here (and rolled back), so the probe never depends on live orders.
--
-- Asserts:
--  1. a pending refund request is filed as the staff (approval.requested row);
--  2. self-approval is refused; an over-refund is refused at filing;
--  3. the owner approves → executed in the same call: refund payment row with
--     recorded_by = the REQUESTER, order_refunds R-number, amount_paid and total
--     down by the refund, a revision written, store_activity rows
--     approval.approved / approval.executed / refund.issued (approved_by = owner),
--     and NO duplicate rows from the payment / revision triggers;
--  4. a second approve is refused (CAS);
--  5. a whole refund (cancel_paid) cancels the order with the approver on the
--     order.cancelled row and no paid_then_cancelled flag;
--  4b. decline needs a reason; a direct refund within the staff cap writes refund.issued only;
--  6. client roles cannot insert / update the approval tables or call the
--     functions; even the owner role cannot UPDATE outside the functions, and
--     identity columns never change.

begin;

do $$
declare
  c_tenant constant uuid := '0dd96b60-5232-4c79-922b-0bd9022d12ba';
  c_owner constant uuid := '6e6a5bec-43ad-45fe-b39a-3cfeaba42d60';
  c_staff constant uuid := 'e11c4862-c00e-4508-98fe-8946582f1585';
  c_branch constant uuid := '44d0cfdb-6fee-4e79-9e72-50a46fa56a9e';
  v_branch uuid;
  v_has_shift boolean;
  v_order uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_charge uuid := gen_random_uuid();
  v_out jsonb;
  v_req uuid;
  v_req2 uuid;
  v_refund record;
  v_order_row record;
  v_count integer;
  v_refund_payment uuid;
begin
  -- Fixtures ------------------------------------------------------------------
  -- One open shift per person (idx_staff_shifts_one_open_per_staff): reuse a
  -- live one's branch for the order, else open one at c_branch.
  select true, s.outlet_id into v_has_shift, v_branch from public.staff_shifts s
   where s.tenant_id = c_tenant and s.staff_user_id = c_staff and s.status = 'open' limit 1;
  if v_has_shift is null then
    v_branch := c_branch;
    insert into public.staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, status, opening_float, opened_at)
    values (c_tenant, v_branch, c_staff, 'Probe cashier', 'open', 0, now() - interval '1 hour');
  end if;

  insert into public.orders (id, tenant_id, outlet_id, customer_name, total, status, payment_status, source,
                             payment_method_name, created_at)
  values (v_order, c_tenant, v_branch, 'Probe Customer', 480, 'delivered', 'paid', 'pos', 'Cash', now() - interval '20 minutes');
  insert into public.order_items (id, order_id, menu_item_name, quantity, price, subtotal)
  values (v_item, v_order, 'Probe Sisig', 2, 240, 480);
  insert into public.order_payments (id, tenant_id, order_id, kind, amount, payment_method_name, recorded_by, created_at)
  values (v_charge, c_tenant, v_order, 'charge', 480, 'Cash', c_staff, now() - interval '20 minutes');

  -- 1. File a pending items refund as the staff -------------------------------
  v_out := public.create_approval_request(c_tenant, c_staff, 'refund', v_order::text,
    jsonb_build_object('scope', 'items', 'lines', jsonb_build_array(jsonb_build_object('orderItemId', v_item, 'quantity', 1)),
                       'restock', false, 'reasonLabel', 'Wrong item served'),
    'wrong_item', 'Probe note', 'probe_key_0001', false);
  if not coalesce((v_out ->> 'ok')::boolean, false) then
    raise exception 'PROBE FAIL 1: create refused: %', v_out;
  end if;
  v_req := (v_out -> 'request' ->> 'id')::uuid;
  if (v_out -> 'request' ->> 'status') <> 'pending' or (v_out -> 'request' ->> 'amount')::numeric <> 240 then
    raise exception 'PROBE FAIL 1: expected pending ₱240, got %', v_out -> 'request';
  end if;
  if (v_out -> 'request' -> 'order_snapshot') ? 'customerName' or (v_out -> 'request')::text like '%Probe Customer%' then
    raise exception 'PROBE FAIL 1: the snapshot carries customer data';
  end if;
  if not exists (select 1 from public.store_activity a where a.event_key = 'approval_requests:' || v_req || ':approval.requested') then
    raise exception 'PROBE FAIL 1: no approval.requested activity row';
  end if;
  -- Same tap again returns the same request.
  v_out := public.create_approval_request(c_tenant, c_staff, 'refund', v_order::text,
    jsonb_build_object('scope', 'whole'), 'wrong_item', null, 'probe_key_0001', false);
  if not coalesce((v_out ->> 'replayed')::boolean, false) or (v_out -> 'request' ->> 'id')::uuid <> v_req then
    raise exception 'PROBE FAIL 1: idempotency replay did not return the first request: %', v_out;
  end if;
  raise notice 'PASS 1: pending request filed (₱240, no customer data, approval.requested, idempotent)';

  -- 2. Self-approval and over-refund ------------------------------------------
  v_out := public.decide_approval(v_req, c_tenant, c_staff, 'approve');
  if v_out ->> 'code' <> 'self_approval' then
    raise exception 'PROBE FAIL 2: self-approval not refused: %', v_out;
  end if;
  v_out := public.approval_quote(c_tenant, c_staff, 'refund', v_order::text, jsonb_build_object('scope', 'amount', 'amount', 10000));
  if v_out ->> 'code' <> 'over_refund' then
    raise exception 'PROBE FAIL 2: over-refund not refused: %', v_out;
  end if;
  raise notice 'PASS 2: self-approval refused, over-refund refused';

  -- 3. Owner approves → executed ------------------------------------------------
  v_out := public.decide_approval(v_req, c_tenant, c_owner, 'approve');
  if not coalesce((v_out ->> 'ok')::boolean, false) or (v_out -> 'request' ->> 'status') <> 'executed' then
    raise exception 'PROBE FAIL 3: approve did not execute: %', v_out;
  end if;

  select * into v_refund from public.order_refunds f where f.approval_id = v_req;
  if v_refund.id is null or v_refund.refund_number < 1 or v_refund.amount <> 240
     or v_refund.issued_by <> c_staff or v_refund.approved_by <> c_owner then
    raise exception 'PROBE FAIL 3: order_refunds row wrong: %', to_jsonb(v_refund);
  end if;
  if (v_out -> 'result' ->> 'refundLabel') !~ '^R-\d{4,}$' then
    raise exception 'PROBE FAIL 3: refund label missing: %', v_out -> 'result';
  end if;
  v_refund_payment := v_refund.payment_row_ids[1];
  select count(*) into v_count from public.order_payments p
   where p.id = v_refund_payment and p.kind = 'refund' and p.amount = 240
     and p.recorded_by = c_staff and p.payment_method_name = 'Cash';
  if v_count <> 1 then
    raise exception 'PROBE FAIL 3: refund payment row missing or not recorded by the requester';
  end if;
  select o.amount_paid, o.total, o.revision_number into v_order_row from public.orders o where o.id = v_order;
  if v_order_row.amount_paid <> 240 or v_order_row.total <> 240 or v_order_row.revision_number <> 1 then
    raise exception 'PROBE FAIL 3: order not adjusted: %', to_jsonb(v_order_row);
  end if;
  if (select quantity from public.order_items where id = v_item) <> 1 then
    raise exception 'PROBE FAIL 3: refunded line quantity not reduced';
  end if;
  if not exists (select 1 from public.order_revisions r where r.id = v_refund.revision_id and r.total_before = 480 and r.total_after = 240) then
    raise exception 'PROBE FAIL 3: revision row missing';
  end if;
  if not exists (select 1 from public.store_activity a where a.event_key = 'order_refunds:' || v_refund.id
                   and a.kind = 'refund.issued' and a.actor_user_id = c_staff and a.approved_by = c_owner and a.amount = -240) then
    raise exception 'PROBE FAIL 3: refund.issued row missing or without the approver';
  end if;
  if not exists (select 1 from public.store_activity a where a.event_key = 'approval_requests:' || v_req || ':approval.approved' and a.approved_by = c_owner)
     or not exists (select 1 from public.store_activity a where a.event_key = 'approval_requests:' || v_req || ':approval.executed') then
    raise exception 'PROBE FAIL 3: approval.approved / approval.executed rows missing';
  end if;
  if exists (select 1 from public.store_activity a where a.event_key in ('order_payments:' || v_refund_payment, 'order_revisions:' || v_refund.revision_id)) then
    raise exception 'PROBE FAIL 3: the payment / revision triggers double-reported the refund';
  end if;
  raise notice 'PASS 3: executed — R-%, payment by requester, amount_paid 480→240, revision 1, one refund.issued with approver', v_refund.refund_number;

  -- 4. Double approve (CAS) -----------------------------------------------------
  v_out := public.decide_approval(v_req, c_tenant, c_owner, 'approve');
  if v_out ->> 'code' <> 'not_pending' then
    raise exception 'PROBE FAIL 4: second approve not refused: %', v_out;
  end if;
  if (select count(*) from public.order_refunds where approval_id = v_req) <> 1 then
    raise exception 'PROBE FAIL 4: second refund row written';
  end if;
  raise notice 'PASS 4: second approve refused, still one refund';

  -- 4b. Decline needs a reason; a direct refund within the staff's own limit ---
  v_out := public.create_approval_request(c_tenant, c_staff, 'refund', v_order::text,
    jsonb_build_object('scope', 'amount', 'amount', 10), 'took_too_long', null, 'probe_key_0003', false);
  v_req2 := (v_out -> 'request' ->> 'id')::uuid;
  if public.decide_approval(v_req2, c_tenant, c_owner, 'decline') ->> 'code' <> 'reason_required' then
    raise exception 'PROBE FAIL 4b: decline without a reason was accepted';
  end if;
  v_out := public.decide_approval(v_req2, c_tenant, c_owner, 'decline', 'offer_replacement', 'Give a free drink');
  if (v_out -> 'request' ->> 'status') <> 'declined'
     or not exists (select 1 from public.store_activity a where a.event_key = 'approval_requests:' || v_req2 || ':approval.declined') then
    raise exception 'PROBE FAIL 4b: decline not recorded: %', v_out;
  end if;
  -- ₱20, same day, staff holds order_refund: no one is asked.
  v_out := public.create_and_execute_approval(c_tenant, c_staff, 'refund', v_order::text,
    jsonb_build_object('scope', 'amount', 'amount', 20), 'took_too_long', null, 'probe_key_0004');
  if (v_out -> 'request' ->> 'status') <> 'executed' or not ((v_out -> 'request' ->> 'is_direct')::boolean) then
    raise exception 'PROBE FAIL 4b: direct refund did not execute: %', v_out;
  end if;
  if not exists (select 1 from public.store_activity a
                  where a.event_key = 'order_refunds:' || (v_out -> 'result' ->> 'refundId')
                    and a.approved_by is null and a.actor_user_id = c_staff)
     or exists (select 1 from public.store_activity a
                 where a.event_key like 'approval_requests:' || (v_out -> 'request' ->> 'id') || ':%') then
    raise exception 'PROBE FAIL 4b: direct refund activity wrong (expected refund.issued only, no approver, no approval.* rows)';
  end if;
  -- Direct above the staff's own cap is refused by the database itself.
  if not public.approval_direct_allowed(c_tenant, c_staff, 'refund', 300, now())
     or public.approval_direct_allowed(c_tenant, c_staff, 'refund', 300.01, now())
     or public.approval_direct_allowed(c_tenant, c_staff, 'refund', 10, now() - interval '2 days') then
    raise exception 'PROBE FAIL 4b: approval_direct_allowed disagrees with the ₱300 same-day rule';
  end if;
  if (select amount_paid from public.orders where id = v_order) <> 220 then
    raise exception 'PROBE FAIL 4b: amount_paid should be 220 after the direct ₱20 refund';
  end if;
  raise notice 'PASS 4b: decline needs a reason and is recorded; direct ₱20 refund executed with refund.issued only';

  -- 5. Cancel paid (whole) -------------------------------------------------------
  v_out := public.create_approval_request(c_tenant, c_staff, 'cancel_paid', v_order::text,
    jsonb_build_object('restock', true, 'reasonLabel', 'Customer left'), 'customer_left', null, 'probe_key_0002', false);
  if not coalesce((v_out ->> 'ok')::boolean, false) or (v_out -> 'request' ->> 'amount')::numeric <> 220 then
    raise exception 'PROBE FAIL 5: cancel request refused or wrong amount (expected the ₱220 left): %', v_out;
  end if;
  v_req2 := (v_out -> 'request' ->> 'id')::uuid;
  v_out := public.decide_approval(v_req2, c_tenant, c_owner, 'approve');
  if (v_out -> 'request' ->> 'status') <> 'executed' then
    raise exception 'PROBE FAIL 5: cancel did not execute: %', v_out;
  end if;
  select o.status, o.amount_paid into v_order_row from public.orders o where o.id = v_order;
  if v_order_row.status <> 'cancelled' or v_order_row.amount_paid <> 0 then
    raise exception 'PROBE FAIL 5: order not cancelled / not fully refunded: %', to_jsonb(v_order_row);
  end if;
  select count(*) into v_count from public.store_activity a
   where a.tenant_id = c_tenant and a.subject_ref = v_order::text and a.kind = 'order.cancelled';
  if v_count <> 1 then
    raise exception 'PROBE FAIL 5: expected one order.cancelled row, got %', v_count;
  end if;
  if exists (select 1 from public.store_activity a where a.subject_ref = v_order::text and a.kind = 'order.cancelled'
               and ('paid_then_cancelled' = any (a.flags) or a.approved_by is distinct from c_owner)) then
    raise exception 'PROBE FAIL 5: order.cancelled flagged or without approver';
  end if;
  raise notice 'PASS 5: cancel_paid cancelled the order, refunded the rest, one clean order.cancelled row';

  -- 6. Nobody writes outside the functions --------------------------------------
  begin
    set local role authenticated;
    insert into public.approval_requests (tenant_id, kind, status, amount, reason_code, requested_by, expires_at, idempotency_key, external_order_id)
    values (c_tenant, 'refund', 'approved', 1, 'x', c_staff, now(), 'probe_key_9999', v_order::text);
    raise exception 'PROBE FAIL 6: authenticated inserted an approval request';
  exception when insufficient_privilege then null;
  end;
  begin
    set local role authenticated;
    insert into public.order_refunds (tenant_id, order_id, refund_number, scope, amount, approval_id, issued_by)
    values (c_tenant, v_order::text, 999999, 'amount', 1, gen_random_uuid(), c_staff);
    raise exception 'PROBE FAIL 6: authenticated inserted an order refund';
  exception when insufficient_privilege then null;
  end;
  begin
    set local role service_role;
    update public.approval_requests set note = 'tamper' where id = v_req;
    raise exception 'PROBE FAIL 6: service_role updated an approval request directly';
  exception when insufficient_privilege then null;
  end;
  begin
    set local role anon;
    perform public.decide_approval(v_req, c_tenant, c_owner, 'approve');
    raise exception 'PROBE FAIL 6: anon executed decide_approval';
  exception when insufficient_privilege then null;
  end;
  begin
    set local role authenticated;
    perform public.create_and_execute_approval(c_tenant, c_staff, 'refund', v_order::text, '{}'::jsonb, 'wrong_item', null, 'probe_key_8888');
    raise exception 'PROBE FAIL 6: authenticated executed create_and_execute_approval';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The functions left app.approvals_writer on for this transaction; clear it
  -- to prove the trigger itself refuses an owner-role UPDATE.
  perform set_config('app.approvals_writer', '', true);
  begin
    update public.approval_requests set status = 'pending' where id = v_req;
    raise exception 'PROBE FAIL 6: owner role updated outside the functions';
  exception when insufficient_privilege then null;
  end;
  perform set_config('app.approvals_writer', 'on', true);
  begin
    update public.approval_requests set amount = 1 where id = v_req;
    raise exception 'PROBE FAIL 6: an identity column changed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.order_refunds set amount = 1 where id = v_refund.id;
    raise exception 'PROBE FAIL 6: order_refunds row changed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('app.approvals_writer', '', true);
  raise notice 'PASS 6: client roles refused; trigger refuses out-of-band and identity changes; refunds append-only';
end;
$$;

rollback;
