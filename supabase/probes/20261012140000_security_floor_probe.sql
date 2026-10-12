-- Probe for 20261012140000_security_floor_activity.sql
--
-- Run AFTER applying the migration, as the database owner (Supabase MCP
-- execute_sql). Everything happens in ONE transaction that ends in ROLLBACK:
-- the writes below are real (so triggers and RLS really run) and are all
-- undone. Any guarantee that does not hold RAISEs "PROBE FAIL …" and aborts.
-- A clean run ends with NOTICE 'security floor probe: all checks passed'.
--
-- Part 1 = object existence (plain SELECTs, read-only; run on their own too).
-- Part 2 = behaviour, as the role that really runs the query (authenticated
--          with request.jwt.claims; service_role; the owner).
--
-- Accounts (picked 2026-10-12 from public.app_users; all non-owner,
-- store-wide, on platform-backend tenants with no branches):
--   A  72af8d9a-c3c0-4a2c-b49d-9e52ee266aaf  snxp-ktchn
--      permissions {orders,customers,pos,order_edit}
--      → NO order_refund, NO vouchers, NO menu. Holds orders.
--   B  5ea67c4e-6441-4930-87c2-5e2238dcb20b  daily-dash-x-la-pasta
--      permissions {pos} → NO orders.
--   C  1f0986c9-b791-4c66-8ef2-84ac0e6b825d  sorpresso
--      permissions {orders,menu,customers,pos,order_edit,order_refund}
-- If any of these accounts changes, re-pick with:
--   select au.user_id, t.slug, au.permissions from app_users au
--     join tenants t on t.id = au.tenant_id
--    where au.role = 'admin' and not coalesce(au.is_owner, false)
--      and au.permissions is not null and au.outlet_id is null;

-- ============================================
-- Part 1: objects exist (read-only)
-- ============================================

-- Expect 0 rows: no UPDATE/ALL policy left on the two ledgers.
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename in ('order_payments', 'order_revisions')
   and cmd in ('UPDATE', 'ALL');

-- Expect 0 rows: no client write policy on voucher_redemptions.
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'voucher_redemptions' and cmd <> 'SELECT';

-- Expect 6 rows, all enabled ('O'). (No orders_client_cancel_guard: that was
-- the never-applied first draft.)
select c.relname, t.tgname, t.tgenabled from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal and t.tgname in (
   'order_payments_append_only', 'order_revisions_append_only',
   'order_payments_stamp_actor', 'order_revisions_stamp_actor', 'stock_movements_stamp_actor',
   'orders_client_status_guard')
 order by 1, 2;

-- Expect app_user_has_permission: prosecdef = true, proconfig = {search_path=""};
-- the three trigger functions with a pinned search_path.
select p.proname, p.prosecdef, p.proconfig, p.proacl::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('app_user_has_permission', 'order_ledger_append_only', 'stamp_client_actor', 'orders_client_status_guard', 'orders_client_cancel_guard');
-- (orders_client_cancel_guard must NOT appear.)

-- Expect false / false (UPDATE revoked on both ledgers) and false x3 (redemptions).
select has_table_privilege('authenticated', 'public.order_payments', 'UPDATE') as payments_update,
       has_table_privilege('authenticated', 'public.order_revisions', 'UPDATE') as revisions_update,
       has_table_privilege('authenticated', 'public.voucher_redemptions', 'INSERT') as redemptions_insert,
       has_table_privilege('authenticated', 'public.voucher_redemptions', 'UPDATE') as redemptions_update,
       has_table_privilege('authenticated', 'public.voucher_redemptions', 'DELETE') as redemptions_delete;

-- The rewritten policies, for eyeballing.
select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies
 where schemaname = 'public'
   and (policyname in ('order_payments_insert_admin', 'stock_movements_insert_branch')
        or tablename in ('vouchers', 'voucher_targets', 'voucher_redemptions'))
 order by tablename, policyname;

-- ============================================
-- Part 2: behaviour (one transaction, rolled back)
-- ============================================

begin;

do $probe$
declare
  c_tenant_a constant uuid := 'f0e9c8b6-24c8-4a03-800e-c84ca8687e6b';  -- snxp-ktchn
  c_staff_a  constant uuid := '72af8d9a-c3c0-4a2c-b49d-9e52ee266aaf';
  c_tenant_b constant uuid := '732ca41b-8ddf-4b4c-89e3-026419746521';  -- daily-dash-x-la-pasta
  c_staff_b  constant uuid := '5ea67c4e-6441-4930-87c2-5e2238dcb20b';
  c_tenant_c constant uuid := 'acccced5-a00e-4141-b5c2-ef53d5f74ad1';  -- sorpresso
  c_staff_c  constant uuid := '1f0986c9-b791-4c66-8ef2-84ac0e6b825d';

  v_order_a uuid; v_order_a_delivered uuid; v_order_b uuid; v_order_b_cancelled uuid;
  v_order_c uuid; v_order_c_delivered uuid;
  v_ledger_order_c uuid; v_payment_c uuid; v_revision_c uuid;
  v_item_a uuid; v_item_c uuid; v_voucher_a uuid;
  v_id uuid; v_by uuid; v_at timestamptz; v_n integer; v_msg text; v_rev integer;
begin
  -- ---------- fixtures, read as the owner ----------
  select id into v_order_a from public.orders where tenant_id = c_tenant_a order by created_at desc limit 1;
  select id into v_order_a_delivered from public.orders
   where tenant_id = c_tenant_a and id <> v_order_a order by created_at desc limit 1;
  select id into v_order_b from public.orders where tenant_id = c_tenant_b order by created_at desc limit 1;
  select id into v_order_b_cancelled from public.orders
   where tenant_id = c_tenant_b and id <> v_order_b order by created_at desc limit 1;
  select id into v_order_c from public.orders where tenant_id = c_tenant_c order by created_at desc limit 1;
  select id into v_order_c_delivered from public.orders
   where tenant_id = c_tenant_c and id <> v_order_c order by created_at desc limit 1;
  -- An order of C's with a payment AND a revision, not loyalty-settled (FK NO ACTION).
  select o.id into v_ledger_order_c from public.orders o
   where o.tenant_id = c_tenant_c
     and exists (select 1 from public.order_payments p where p.order_id = o.id)
     and exists (select 1 from public.order_revisions r where r.order_id = o.id)
     and not exists (select 1 from public.loyalty_projected_receipts l where l.order_id = o.id)
   limit 1;
  select id into v_payment_c from public.order_payments where order_id = v_ledger_order_c limit 1;
  select id into v_revision_c from public.order_revisions where order_id = v_ledger_order_c limit 1;
  select id into v_item_a from public.inventory_items where tenant_id = c_tenant_a limit 1;
  select id into v_item_c from public.inventory_items where tenant_id = c_tenant_c limit 1;
  select id into v_voucher_a from public.vouchers where tenant_id = c_tenant_a limit 1;

  if v_order_a is null or v_order_a_delivered is null or v_order_b is null or v_order_c is null
     or v_order_b_cancelled is null or v_order_c_delivered is null
     or v_ledger_order_c is null or v_item_a is null or v_item_c is null or v_voucher_a is null then
    raise exception 'PROBE SETUP: a fixture is missing — re-pick the accounts (see header)';
  end if;

  -- Deterministic starting states (owner writes; the guard ignores the owner).
  update public.orders set status = 'pending'   where id in (v_order_a, v_order_b, v_order_c);
  update public.orders set status = 'delivered' where id in (v_order_a_delivered, v_order_c_delivered);
  update public.orders set status = 'cancelled' where id = v_order_b_cancelled;

  -- ================= Staff A: no order_refund / vouchers / menu =================
  perform set_config('request.jwt.claims', json_build_object('sub', c_staff_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- helper semantics, as A
  if public.app_user_has_permission(c_tenant_a, 'order_refund') then raise exception 'PROBE FAIL A0: helper grants order_refund to A'; end if;
  if not public.app_user_has_permission(c_tenant_a, 'orders') then raise exception 'PROBE FAIL A0: helper refuses orders to A'; end if;
  if not public.app_user_has_permission(c_tenant_a, 'kitchen') then raise exception 'PROBE FAIL A0: kitchen not implied by orders'; end if;
  if public.app_user_has_permission(c_tenant_c, 'orders') then raise exception 'PROBE FAIL A0: helper grants another store'; end if;

  -- A1 refund refused
  begin
    insert into public.order_payments (tenant_id, order_id, kind, amount, note)
    values (c_tenant_a, v_order_a, 'refund', 1, 'security floor probe');
    raise exception 'PROBE FAIL A1: staff without order_refund inserted a refund';
  exception when insufficient_privilege then null;
  end;

  -- A2 charge allowed; spoofed actor and time are overwritten
  insert into public.order_payments (tenant_id, order_id, kind, amount, recorded_by, created_at, note)
  values (c_tenant_a, v_order_a, 'charge', 1, c_staff_c, '2020-01-01T00:00:00Z', 'security floor probe')
  returning id, recorded_by, created_at into v_id, v_by, v_at;
  if v_by is distinct from c_staff_a then raise exception 'PROBE FAIL A2: recorded_by kept the spoofed value %', v_by; end if;
  if v_at is distinct from now() then raise exception 'PROBE FAIL A2: created_at kept the spoofed value %', v_at; end if;

  -- A3 the payment cannot be edited, re-pointed or deleted
  begin
    update public.order_payments set amount = 999 where id = v_id;
    raise exception 'PROBE FAIL A3: client updated a payment';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.order_payments set order_id = v_order_c where id = v_id;
    raise exception 'PROBE FAIL A3: client re-pointed a payment';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.order_payments where id = v_id;
    raise exception 'PROBE FAIL A3: client deleted a payment';
  exception when insufficient_privilege then null;
  end;

  -- A4 vouchers: no write without the grant (RLS hides the row: zero rows, no error)
  update public.vouchers set is_active = is_active where id = v_voucher_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'PROBE FAIL A4: staff without vouchers updated a voucher'; end if;
  delete from public.vouchers where id = v_voucher_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'PROBE FAIL A4: staff without vouchers deleted a voucher'; end if;
  begin
    insert into public.vouchers (tenant_id, code, name, discount_type, discount_value)
    values (c_tenant_a, 'PROBE-FLOOR', 'probe', 'fixed', 1);
    raise exception 'PROBE FAIL A4: staff without vouchers created a voucher';
  exception when insufficient_privilege then null;
  end;
  -- ...but can still READ them (the register applies vouchers)
  select count(*) into v_n from public.vouchers where id = v_voucher_a;
  if v_n <> 1 then raise exception 'PROBE FAIL A4: staff can no longer read vouchers'; end if;

  -- A5 redemptions: no client insert at all
  begin
    insert into public.voucher_redemptions (tenant_id, voucher_id, order_id, amount_discounted, channel)
    values (c_tenant_a, v_voucher_a, v_order_a::text, 1, 'pos');
    raise exception 'PROBE FAIL A5: client inserted a voucher redemption';
  exception when insufficient_privilege then null;
  end;

  -- A6 stock movement refused for lack of menu — and refused BY RLS, not by
  -- something earlier in the trigger chain.
  begin
    insert into public.stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, note)
    values (c_tenant_a, v_item_a, 'waste', -1, 'security floor probe');
    raise exception 'PROBE FAIL A6: staff without menu inserted a stock movement';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%row-level security policy for table "stock_movements"%' then
      raise exception 'PROBE INCONCLUSIVE A6: refused for another reason: %', v_msg;
    end if;
  end;

  -- A7 a delivered order cannot be cancelled even by an orders holder
  begin
    update public.orders set status = 'cancelled' where id = v_order_a_delivered;
    raise exception 'PROBE FAIL A7: client cancelled a delivered order';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'PROBE FAIL%' then raise exception '%', v_msg; end if;
    if v_msg not like '%already delivered%' then raise exception 'PROBE INCONCLUSIVE A7: %', v_msg; end if;
  end;

  -- A7b review M2: the cancel rule cannot be sidestepped by cycling the
  -- status. A holds orders but NOT order_edit: delivered -> pending refused.
  begin
    update public.orders set status = 'pending' where id = v_order_a_delivered;
    raise exception 'PROBE FAIL A7b: staff without order_edit moved a delivered order back to pending';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%needs the Edit Orders permission%' then raise exception 'PROBE INCONCLUSIVE A7b: %', v_msg; end if;
  end;
  select status into v_msg from public.orders where id = v_order_a_delivered;
  if v_msg <> 'delivered' then raise exception 'PROBE FAIL A7b: delivered order now reads %', v_msg; end if;

  -- A8 an orders holder can still cancel a live order
  update public.orders set status = 'cancelled' where id = v_order_a;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'PROBE FAIL A8: orders holder could not cancel a pending order'; end if;

  -- A9 ...and reopen it (web admin dropdown: cancelled -> pending)
  update public.orders set status = 'pending' where id = v_order_a;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'PROBE FAIL A9: orders holder could not reopen a cancelled order'; end if;

  reset role;

  -- ================= Staff B: no orders =================
  perform set_config('request.jwt.claims', json_build_object('sub', c_staff_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- B1 cancelling needs orders
  begin
    update public.orders set status = 'cancelled' where id = v_order_b;
    raise exception 'PROBE FAIL B1: staff without orders cancelled an order';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%needs the Orders permission%' then raise exception 'PROBE INCONCLUSIVE B1: %', v_msg; end if;
  end;

  -- B2 other status changes are untouched (the register confirms its sales)
  update public.orders set status = 'confirmed' where id = v_order_b;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'PROBE FAIL B2: pos staff can no longer confirm an order'; end if;

  -- B2b reopening a cancelled order needs orders
  begin
    update public.orders set status = 'pending' where id = v_order_b_cancelled;
    raise exception 'PROBE FAIL B2b: staff without orders reopened a cancelled order';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%needs the Orders permission%' then raise exception 'PROBE INCONCLUSIVE B2b: %', v_msg; end if;
  end;

  -- B3 a charge from the register still lands
  insert into public.order_payments (tenant_id, order_id, kind, amount, note)
  values (c_tenant_b, v_order_b, 'charge', 1, 'security floor probe');

  reset role;

  -- ================= Staff C: holds order_refund + menu =================
  perform set_config('request.jwt.claims', json_build_object('sub', c_staff_c, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- C1 refund allowed
  insert into public.order_payments (tenant_id, order_id, kind, amount, note)
  values (c_tenant_c, v_order_c, 'refund', 1, 'security floor probe');

  -- C2 even a refund holder cannot rewrite history
  begin
    update public.order_payments set amount = amount + 1 where id = v_payment_c;
    raise exception 'PROBE FAIL C2: client updated an existing payment';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.order_revisions set reason = 'rewritten' where id = v_revision_c;
    raise exception 'PROBE FAIL C2: client updated an existing revision';
  exception when insufficient_privilege then null;
  end;

  -- C2b an order_edit holder may correct "delivered by mistake"...
  update public.orders set status = 'ready' where id = v_order_c_delivered;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'PROBE FAIL C2b: order_edit holder could not move a delivered order back'; end if;

  -- C3 stock movement allowed with menu; created_by stamped
  insert into public.stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, created_by, note)
  values (c_tenant_c, v_item_c, 'waste', -0.001, c_staff_a, 'security floor probe')
  returning created_by into v_by;
  if v_by is distinct from c_staff_c then raise exception 'PROBE FAIL C3: created_by kept the spoofed value %', v_by; end if;

  -- C4 revision insert allowed; revised_by stamped
  select coalesce(max(revision_number), 0) + 1 into v_rev from public.order_revisions where order_id = v_ledger_order_c;
  insert into public.order_revisions (tenant_id, order_id, revision_number, items_before, items_after, total_before, total_after, revised_by, reason)
  values (c_tenant_c, v_ledger_order_c, v_rev, '[]'::jsonb, '[]'::jsonb, 0, 0, c_staff_a, 'security floor probe')
  returning revised_by into v_by;
  if v_by is distinct from c_staff_c then raise exception 'PROBE FAIL C4: revised_by kept the spoofed value %', v_by; end if;

  reset role;

  -- ================= Service role and owner =================
  -- '{}' rather than '': an empty string is not valid jsonb for auth.uid().
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;

  -- S1 the server keeps the actor and time it sends
  insert into public.order_payments (tenant_id, order_id, kind, amount, recorded_by, created_at, note)
  values (c_tenant_c, v_order_c, 'charge', 1, c_staff_c, '2020-01-01T00:00:00Z', 'security floor probe')
  returning recorded_by, created_at into v_by, v_at;
  if v_by is distinct from c_staff_c or v_at <> '2020-01-01T00:00:00Z'::timestamptz then
    raise exception 'PROBE FAIL S1: service-role actor/time were overwritten (%, %)', v_by, v_at;
  end if;

  -- S2 the service role cannot rewrite a payment either
  begin
    update public.order_payments set amount = amount + 1 where id = v_payment_c;
    raise exception 'PROBE FAIL S2: service role updated a payment';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%append-only%' then raise exception 'PROBE INCONCLUSIVE S2: %', v_msg; end if;
  end;
  begin
    delete from public.order_payments where id = v_payment_c;
    raise exception 'PROBE FAIL S2: service role deleted a payment';
  exception when insufficient_privilege then null;
  end;

  reset role;

  -- S3 deleting the ORDER still cascades through the guard (order deletion)
  delete from public.orders where id = v_ledger_order_c;
  select count(*) into v_n from public.order_payments where order_id = v_ledger_order_c;
  if v_n <> 0 then raise exception 'PROBE FAIL S3: payments survived their order''s deletion'; end if;
  select count(*) into v_n from public.order_revisions where order_id = v_ledger_order_c;
  if v_n <> 0 then raise exception 'PROBE FAIL S3: revisions survived their order''s deletion'; end if;

  raise notice 'security floor probe: all checks passed';
end;
$probe$;

rollback;
