-- Probe for 20261012150000..20261012151500 (store_activity). ONE transaction,
-- ends in ROLLBACK: nothing it writes survives. RAISEs on the first failure.
-- Run after the migrations are applied (as the postgres / service owner).
--
-- Fixture ids (real platform rows, picked 2026-10-12 by SELECT):
--   tenant  0dd96b60-5232-4c79-922b-0bd9022d12ba  Gungjeon Unlimited (order_backend = 'platform', 5 branches)
--   owner   6e6a5bec-43ad-45fe-b39a-3cfeaba42d60  is_owner admin
--   staff   31140db3-eb9f-45c2-b0af-c94763106b67  branch-locked admin, explicit permissions WITHOUT activity_view
--   branch  14fd49f0-c4f1-4b57-9473-0d2547f15cc7  the staff's branch (Valenzuela)
--   other   66ea076d-2aa1-45d4-b575-743fcdf3d73a  another branch of the same store
--   item    8995a367-c7bd-439c-82a2-121c5513a348  an active inventory item
--   dish    01d96a9b-31b9-4a5a-8510-feaeb97a6042  a menu item
--
-- Asserts:
--  (a) representative source writes produce the expected kinds/flags exactly once,
--      incl. the platform cancel dedupe against a platform order_status_events row;
--  (b) visibility: branch-locked staff without activity_view sees ONLY own rows with
--      flags stripped and nothing for p_flagged_only; owner sees all; anon is refused;
--  (c) UPDATE / DELETE on store_activity are refused (outside mark_store_activity_reviewed).

begin;

create temp table probe_ctx (k text primary key, v text) on commit drop;
grant select on probe_ctx to authenticated, anon;

insert into probe_ctx values
  ('tenant', '0dd96b60-5232-4c79-922b-0bd9022d12ba'),
  ('owner', '6e6a5bec-43ad-45fe-b39a-3cfeaba42d60'),
  ('staff', '31140db3-eb9f-45c2-b0af-c94763106b67'),
  ('branch', '14fd49f0-c4f1-4b57-9473-0d2547f15cc7'),
  ('other', '66ea076d-2aa1-45d4-b575-743fcdf3d73a'),
  ('item', '8995a367-c7bd-439c-82a2-121c5513a348'),
  ('dish', '01d96a9b-31b9-4a5a-8510-feaeb97a6042'),
  ('t0', now()::text),
  ('o1', gen_random_uuid()::text), ('o2', gen_random_uuid()::text), ('o3', gen_random_uuid()::text),
  ('o4', gen_random_uuid()::text), ('convex', 'jh7probe' || substr(md5(random()::text), 1, 20));

-- ---------------------------------------------------------------- (a) writes
do $$
declare
  c jsonb := (select jsonb_object_agg(k, v) from probe_ctx);
  t uuid := (c ->> 'tenant')::uuid;
  staff uuid := (c ->> 'staff')::uuid;
  branch uuid := (c ->> 'branch')::uuid;
  other uuid := (c ->> 'other')::uuid;
  o1 uuid := (c ->> 'o1')::uuid; o2 uuid := (c ->> 'o2')::uuid;
  o3 uuid := (c ->> 'o3')::uuid; o4 uuid := (c ->> 'o4')::uuid;
  v_shift uuid := gen_random_uuid();
  n integer;
  r record;
begin
  -- Act as the branch staff member (JWT claims), like a register request would.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', staff, 'role', 'authenticated')::text, true);

  -- Three POS orders at the staff's branch; o1 paid by GCash.
  insert into public.orders (id, tenant_id, outlet_id, customer_name, customer_contact, total, status, payment_status, source, payment_method_name)
  values (o1, t, branch, 'Lara Santos', '+639171234567', 310, 'confirmed', 'paid', 'pos', 'GCash'),
         (o2, t, branch, 'Guest', null, 150, 'confirmed', 'pending', 'pos', null),
         (o3, t, branch, null, null, 99, 'preparing', 'pending', 'pos', null);
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name, recorded_by, outlet_id)
  values (t, o1, 'charge', 310, 'GCash', staff, branch);

  select count(*) into n from public.store_activity where kind = 'order.placed' and subject_ref = o1::text;
  if n <> 1 then raise exception 'probe: expected 1 order.placed for o1, got %', n; end if;
  select * into r from public.store_activity where kind = 'order.placed' and subject_ref = o1::text;
  if r.is_routine is not true or r.actor_user_id <> staff or r.backend <> 'platform' then
    raise exception 'probe: order.placed shape wrong: %', to_jsonb(r);
  end if;
  if r.summary::text ilike '%Lara%' or r.summary::text ilike '%Santos%' or r.summary::text like '%9171234567%' then
    raise exception 'probe: customer PII leaked into summary: %', r.summary;
  end if;
  if r.summary ->> 'customer' <> 'L. S••••' then
    raise exception 'probe: customer mask wrong: %', r.summary ->> 'customer';
  end if;
  select count(*) into n from public.store_activity where kind = 'payment.charged' and subject_ref = o1::text;
  if n <> 1 then raise exception 'probe: expected 1 payment.charged, got %', n; end if;

  -- Cancel the PAID order with a reason (platform path = orders trigger).
  update public.orders set status = 'cancelled', cancel_reason = 'Customer left' where id = o1;
  -- The best-effort client writer also logs it: must NOT double-report.
  insert into public.order_status_events (tenant_id, outlet_id, backend, external_order_id, event, status, previous_status, source, order_total, actor_user_id, actor_name, reason)
  values (t, branch, 'platform_supabase', o1::text, 'status_changed', 'cancelled', 'confirmed', 'pos', 310, staff, 'staff@example.com', 'Customer left');

  select count(*) into n from public.store_activity where kind = 'order.cancelled' and subject_ref = o1::text;
  if n <> 1 then raise exception 'probe: platform cancel must be recorded exactly once, got %', n; end if;
  select * into r from public.store_activity where kind = 'order.cancelled' and subject_ref = o1::text;
  if not ('paid_then_cancelled' = any (r.flags)) then raise exception 'probe: paid_then_cancelled missing: %', r.flags; end if;
  if r.reason is distinct from 'Customer left' then raise exception 'probe: cancel reason not carried: %', r.reason; end if;
  if r.actor_user_id <> staff or r.outlet_id <> branch or r.category <> 'orders' or r.is_routine then
    raise exception 'probe: order.cancelled shape wrong: %', to_jsonb(r);
  end if;

  -- A Convex store's order: placed + cancelled arrive only via order_status_events.
  insert into public.order_status_events (tenant_id, outlet_id, backend, external_order_id, event, status, source, order_total, actor_user_id, actor_name)
  values (t, branch, 'convex', c ->> 'convex', 'placed', 'pending', 'pos', 200, staff, 'staff@example.com');
  insert into public.order_status_events (tenant_id, outlet_id, backend, external_order_id, event, status, source, order_total, actor_user_id, actor_name, reason)
  values (t, branch, 'convex', c ->> 'convex', 'status_changed', 'cancelled', 'pos', 200, staff, 'staff@example.com', 'Ordered twice by mistake');
  select count(*) into n from public.store_activity where subject_ref = c ->> 'convex' and backend = 'convex' and kind in ('order.placed', 'order.cancelled');
  if n <> 2 then raise exception 'probe: convex placed+cancelled expected 2 rows, got %', n; end if;

  -- Third cancel by the same person today → repeat_cancels.
  update public.orders set status = 'cancelled' where id = o2;
  select * into r from public.store_activity where kind = 'order.cancelled' and subject_ref = o2::text;
  if r.id is null or not ('repeat_cancels' = any (r.flags)) then
    raise exception 'probe: repeat_cancels expected on 3rd cancel: %', to_jsonb(r);
  end if;
  if 'paid_then_cancelled' = any (r.flags) then raise exception 'probe: unpaid cancel flagged paid'; end if;

  -- Reopen then status move: reopened (not routine), then routine status_changed.
  update public.orders set status = 'confirmed' where id = o2;
  select count(*) into n from public.store_activity where kind = 'order.reopened' and subject_ref = o2::text;
  if n <> 1 then raise exception 'probe: expected 1 order.reopened, got %', n; end if;

  -- Cash refund on a GCash-paid order → cash_refund_noncash_order (+ refund amount negative).
  insert into public.order_payments (tenant_id, order_id, kind, amount, payment_method_name, recorded_by, outlet_id)
  values (t, o1, 'refund', 185, 'Cash', staff, branch);
  select * into r from public.store_activity where kind = 'refund.issued' and subject_ref = o1::text;
  if r.id is null or r.amount <> -185 or not ('cash_refund_noncash_order' = any (r.flags)) then
    raise exception 'probe: refund row wrong: %', to_jsonb(r);
  end if;

  -- Revision removing an item while the kitchen has it → removed_after_kitchen.
  insert into public.order_revisions (tenant_id, order_id, revision_number, items_before, items_after, total_before, total_after, reason, revised_by, outlet_id)
  values (t, o3, 1,
    '[{"menuItemId":"a","menuItemName":"Chicken Sisig","quantity":2,"price":185}]'::jsonb,
    '[{"menuItemId":"a","menuItemName":"Chicken Sisig","quantity":1,"price":185}]'::jsonb,
    370, 185, 'Customer changed mind', staff, branch);
  select * into r from public.store_activity where kind = 'order.edited' and subject_ref = o3::text;
  if r.id is null or not ('removed_after_kitchen' = any (r.flags)) or r.amount <> -185 then
    raise exception 'probe: order.edited row wrong: %', to_jsonb(r);
  end if;

  -- Manual discount on a new order (voucher lines excluded; label never copied).
  insert into public.orders (id, tenant_id, outlet_id, customer_name, total, status, payment_status, source, discount_total, discount_data)
  values (o4, t, branch, 'Pad Alvarado', 240, 'confirmed', 'pending', 'pos', 0,
    '{"total":60,"lines":[{"label":"Discount — Pad Alvarado","amount":40},{"label":"Senior citizen","amount":20},{"label":"PROMO","amount":5,"voucherId":"x"}]}'::jsonb);
  select count(*) into n from public.store_activity where kind = 'discount.applied' and subject_ref = o4::text;
  if n <> 2 then raise exception 'probe: expected manual + statutory discount rows, got %', n; end if;
  if exists (select 1 from public.store_activity where subject_ref = o4::text and summary::text ilike '%Alvarado%') then
    raise exception 'probe: discount label (customer name) leaked';
  end if;
  if not exists (select 1 from public.store_activity where kind = 'discount.applied' and subject_ref = o4::text
                 and summary ->> 'statutory' = 'true' and amount = -20) then
    raise exception 'probe: statutory discount not split out';
  end if;

  -- Stock written off → stock.wasted, money out negative.
  insert into public.stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, unit_cost, note, created_by, outlet_id)
  values (t, (c ->> 'item')::uuid, 'waste', -2, 50, 'Dropped', staff, branch);
  select * into r from public.store_activity where kind = 'stock.wasted' and source_table = 'stock_movements'
    and subject_ref = c ->> 'item' and occurred_at >= (c ->> 't0')::timestamptz;
  if r.id is null or r.amount <> -100 or r.quantity <> -2 then raise exception 'probe: stock.wasted wrong: %', to_jsonb(r); end if;

  -- inventory audit: duplicate → one row + flag; nothing_to_deduct → nothing.
  insert into public.inventory_audit_log (tenant_id, event, outcome, source, order_id, outlet_id, actor_user_id)
  values (t, 'order_sale', 'duplicate', 'pos', o3::text, branch, staff),
         (t, 'order_sale', 'nothing_to_deduct', 'pos', o2::text, branch, staff);
  select count(*) into n from public.store_activity where source_table = 'inventory_audit_log' and occurred_at >= (c ->> 't0')::timestamptz
    and subject_ref in (o2::text, o3::text);
  if n <> 1 then raise exception 'probe: audit-log noise filter expected 1 row, got %', n; end if;
  if not exists (select 1 from public.store_activity where kind = 'stock.duplicate_blocked' and subject_ref = o3::text
                 and 'duplicate_deduction' = any (flags)) then
    raise exception 'probe: duplicate_deduction flag missing';
  end if;

  -- Drawer: open, close ₱150 short → drawer_variance.
  insert into public.staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float)
  values (v_shift, t, branch, staff, 'Probe Staff', 1000);
  update public.staff_shifts set status = 'closed', closed_at = now(), expected_cash = 1500, closing_count = 1350,
    closed_by = staff, closed_by_name = 'Probe Staff' where id = v_shift;
  select * into r from public.store_activity where kind = 'shift.closed' and subject_ref = v_shift::text;
  if r.id is null or r.amount <> -150 or not ('drawer_variance' = any (r.flags)) then
    raise exception 'probe: shift.closed wrong: %', to_jsonb(r);
  end if;
  select count(*) into n from public.store_activity where kind = 'shift.opened' and subject_ref = v_shift::text;
  if n <> 1 then raise exception 'probe: shift.opened expected 1, got %', n; end if;

  -- Menu price change (store-wide) → menu.price_changed with before/after.
  update public.menu_items set price = coalesce(price, 0) + 10 where id = (c ->> 'dish')::uuid;
  select * into r from public.store_activity where kind = 'menu.price_changed' and subject_ref = c ->> 'dish'
    and occurred_at >= (c ->> 't0')::timestamptz;
  if r.id is null or r.amount <> 10 or position('→' in r.summary ->> 'title') = 0 then
    raise exception 'probe: menu.price_changed wrong: %', to_jsonb(r);
  end if;

  -- An activity row at ANOTHER branch by someone else (the owner) — staff must not see it.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c ->> 'owner', 'role', 'authenticated')::text, true);
  -- (written through the internal writer: a pay-out needs an open drawer shift)
  perform public.store_activity_record(
    p_tenant_id => t, p_kind => 'cash.pay_out', p_event_key => 'probe:other-branch:' || gen_random_uuid(),
    p_source_table => 'probe', p_source_id => 'probe', p_outlet_id => other,
    p_actor_user_id => (c ->> 'owner')::uuid, p_amount => -200, p_flags => array['after_hours']);
  -- A team row (owner only).
  perform public.store_activity_record(
    p_tenant_id => t, p_kind => 'settings.changed', p_event_key => 'probe:team:' || gen_random_uuid(),
    p_source_table => 'probe', p_source_id => 'probe', p_actor_user_id => (c ->> 'owner')::uuid,
    p_summary => '{"title":"Probe setting"}'::jsonb);
  perform set_config('request.jwt.claims', '', true);

  -- Unknown kind / flag are refused by the CHECKs (the writer swallows and warns).
  perform public.store_activity_record(p_tenant_id => t, p_kind => 'order.teleported',
    p_event_key => 'probe:bad-kind', p_source_table => 'probe', p_source_id => 'probe');
  if exists (select 1 from public.store_activity where event_key = 'probe:bad-kind') then
    raise exception 'probe: unknown kind was accepted';
  end if;
end;
$$;

-- ---------------------------------------------------------------- (b) visibility
-- Staff (branch-locked, no activity_view): only own rows, flags stripped.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from probe_ctx where k = 'staff'), 'role', 'authenticated')::text, true);
do $$
declare
  t uuid := (select v from probe_ctx where k = 'tenant')::uuid;
  staff uuid := (select v from probe_ctx where k = 'staff')::uuid;
  t0 timestamptz := (select v from probe_ctx where k = 't0')::timestamptz;
  n integer;
  n_foreign integer;
  n_flagged integer;
  v_summary jsonb;
begin
  select count(*), count(*) filter (where actor_user_id is distinct from staff), count(*) filter (where flags <> '{}')
    into n, n_foreign, n_flagged
  from public.get_store_activity(p_tenant_id => t, p_limit => 100, p_since => t0, p_include_routine => true);
  if n = 0 then raise exception 'probe: staff saw none of their own rows'; end if;
  if n_foreign > 0 then raise exception 'probe: staff without activity_view saw % rows of others', n_foreign; end if;
  if n_flagged > 0 then raise exception 'probe: flags were not stripped for an own-only caller'; end if;
  select count(*) into n from public.get_store_activity(p_tenant_id => t, p_since => t0, p_flagged_only => true);
  if n <> 0 then raise exception 'probe: p_flagged_only returned % rows to an own-only caller', n; end if;
  v_summary := public.get_store_activity_summary(t, t0 - interval '1 minute', now() + interval '1 minute');
  if (v_summary ->> 'flaggedOpen')::integer <> 0 then raise exception 'probe: staff summary flaggedOpen must be 0'; end if;
  begin
    perform public.mark_store_activity_reviewed((select id from public.store_activity limit 1));
    raise exception 'probe: staff could mark reviewed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.store_activity limit 1;
    raise exception 'probe: authenticated can read store_activity directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.store_activity set note = 'x' where tenant_id = t;
    raise exception 'probe: authenticated could UPDATE store_activity';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Owner: everything from the probe, flags included; can review once.
select set_config('request.jwt.claims', json_build_object('sub', (select v from probe_ctx where k = 'owner'), 'role', 'authenticated')::text, true);
do $$
declare
  t uuid := (select v from probe_ctx where k = 'tenant')::uuid;
  t0 timestamptz := (select v from probe_ctx where k = 't0')::timestamptz;
  n integer;
  n_team integer;
  n_flagged integer;
  v_id uuid;
  v_at1 timestamptz;
  v_at2 timestamptz;
  v_summary jsonb;
begin
  select count(*), count(*) filter (where category = 'team'), count(*) filter (where flags <> '{}')
    into n, n_team, n_flagged
  from public.get_store_activity(p_tenant_id => t, p_limit => 100, p_since => t0, p_include_routine => true);
  if n < 20 then raise exception 'probe: owner expected all probe rows (>=20), got %', n; end if;
  if n_team < 1 then raise exception 'probe: owner must see team rows'; end if;
  if n_flagged < 6 then raise exception 'probe: owner expected >=6 flagged rows, got %', n_flagged; end if;
  -- Routine rows are folded out by default.
  select count(*) into n from public.get_store_activity(p_tenant_id => t, p_limit => 100, p_since => t0) where is_routine;
  if n <> 0 then raise exception 'probe: routine rows returned without p_include_routine'; end if;
  -- Keyset: page 2 never repeats page 1.
  select count(*) into n from (
    select id from public.get_store_activity(p_tenant_id => t, p_limit => 3, p_since => t0, p_include_routine => true)
    intersect
    select g.id from public.get_store_activity(p_tenant_id => t, p_limit => 3, p_since => t0, p_include_routine => true,
      p_before_occurred_at => (select min(occurred_at) from public.get_store_activity(p_tenant_id => t, p_limit => 3, p_since => t0, p_include_routine => true)),
      p_before_id => (select id from public.get_store_activity(p_tenant_id => t, p_limit => 3, p_since => t0, p_include_routine => true) order by occurred_at, id limit 1)) g
  ) x;
  if n <> 0 then raise exception 'probe: keyset page overlap'; end if;
  -- Summary: statutory split + flaggedOpen.
  v_summary := public.get_store_activity_summary(t, t0 - interval '1 minute', now() + interval '1 minute');
  if (v_summary ->> 'flaggedOpen')::integer < 6 then raise exception 'probe: owner flaggedOpen too low: %', v_summary ->> 'flaggedOpen'; end if;
  if not exists (select 1 from jsonb_array_elements(v_summary -> 'byKind') e
                 where e ->> 'kind' = 'discount.applied' and (e ->> 'statutory')::boolean) then
    raise exception 'probe: summary did not split statutory discounts';
  end if;
  -- Review: once, idempotent.
  select id into v_id from public.get_store_activity(p_tenant_id => t, p_since => t0, p_flagged_only => true) limit 1;
  v_at1 := public.mark_store_activity_reviewed(v_id);
  v_at2 := public.mark_store_activity_reviewed(v_id);
  if v_at1 is null or v_at1 <> v_at2 then raise exception 'probe: review not idempotent (% vs %)', v_at1, v_at2; end if;
  -- 93-day bound.
  begin
    perform public.get_store_activity_summary(t, now() - interval '200 days', now());
    raise exception 'probe: summary accepted a 200-day window';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Anon: refused outright.
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$
begin
  begin
    perform 1 from public.get_store_activity((select v from probe_ctx where k = 'tenant')::uuid);
    raise exception 'probe: anon could call get_store_activity';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ---------------------------------------------------------------- (c) append-only
reset role;
do $$
declare
  t uuid := (select v from probe_ctx where k = 'tenant')::uuid;
  t0 timestamptz := (select v from probe_ctx where k = 't0')::timestamptz;
begin
  begin
    update public.store_activity set note = 'tampered' where tenant_id = t and occurred_at >= t0;
    raise exception 'probe: UPDATE on store_activity was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.store_activity set reviewed_at = now(), reviewed_by = gen_random_uuid() where tenant_id = t and occurred_at >= t0 and reviewed_at is null;
    raise exception 'probe: review columns writable without mark_store_activity_reviewed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.store_activity where tenant_id = t and occurred_at >= t0;
    raise exception 'probe: DELETE on store_activity was allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'store_activity probe: ALL CHECKS PASSED';
end;
$$;

rollback;
