-- Order stock: the claim and the ledger rows commit TOGETHER.
--
-- Until now an order's stock moved in two HTTP calls from the web server:
-- INSERT the `order_stock_applications` claim, then INSERT the
-- `stock_movements` rows, with a DELETE of the claim if the second call failed.
-- Both gaps were real:
--   * a crash (Vercel timeout, deploy) between the two left the claim behind
--     with no rows: every retry answered "duplicate" and the order was never
--     depleted;
--   * a network error AFTER the ledger insert committed made the server
--     release the claim, so the retry deducted the order a second time.
-- A cancellation had the same shape (void claim, then reversal rows), and its
-- "what came back" record was a third call.
--
-- `apply_order_stock_claim` does all of it in ONE transaction, under a
-- per-order advisory lock so a sale, an edit and a cancellation of the same
-- order are serialised (READ COMMITTED: each one sees what the previous one
-- committed). The existing BEFORE INSERT triggers on stock_movements keep
-- doing the running totals, branch shelves and frozen cost.
--
-- The claim key is unchanged: (tenant_id, order_id, reason, kind, revision),
-- the unique index `order_stock_applications_unique_kind`.
--
-- Modes:
--   'rows'        insert the claim and the rows the caller computed (a sale,
--                 an edit's difference, an un-cancel's re-spend). Zero rows is
--                 allowed: the claim alone is then the record.
--   'reverse_all' (reason 'void', kind 'order' only) insert the void claim and
--                 the reversal of EVERYTHING the order recorded, netted per
--                 ingredient + entered unit + branch, computed here from
--                 stock_movements under the lock, and remember it in
--                 `restored`. (Replaces `buildReversalRows`, which did this
--                 in TypeScript from a read taken outside the transaction.)
--
-- Guards (the database is the authority, not the caller's earlier read):
--   * kind 'order', reason 'sale': refused ('cancelled_first') when a void
--     claim of the order's own life sits at or above this revision — cancel
--     wins (`hasBlockingVoidClaim`).
--   * kind 'edit': refused ('cancelled_first') when the order is cancelled as
--     far as its stock is concerned (`isCancelledByClaims`).
--   * kind 'edit', void rows: each give-back is CAPPED at what this order
--     still holds of that ingredient on that branch (minus its sales, plus its
--     returns). An edit can never put back more than the order spent.
--
-- Answers jsonb: { "status": "applied" | "duplicate" | "cancelled_first",
--                  "rows": [ the stock_movements rows written ] }.
-- Any error (an item outside the tenant, a bad row) aborts the whole call:
-- no claim, no rows, so a retry is clean.
--
-- Service role only (the web server). SECURITY INVOKER: RLS is not the
-- boundary here, the grant is.

create or replace function public.apply_order_stock_claim(
  p_tenant_id uuid,
  p_order_id text,
  p_reason text,
  p_kind text,
  p_revision integer,
  p_movements jsonb default '[]'::jsonb,
  p_mode text default 'rows'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_max_rows constant integer := 500;
  v_latest_sale integer;
  v_row jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_written jsonb := '[]'::jsonb;
  v_item uuid;
  v_outlet uuid;
  v_unit uuid;
  v_reason text;
  v_delta numeric;
  v_entered numeric;
  v_key text;
  v_held jsonb := '{}'::jsonb;
  v_remaining numeric;
  v_capped numeric;
begin
  if p_tenant_id is null or p_order_id is null or btrim(p_order_id) = ''
     or length(p_order_id) > 200
     or p_reason is null or p_reason not in ('sale', 'void')
     or p_kind is null or p_kind not in ('order', 'edit')
     or p_revision is null or p_revision < 0
     or p_mode is null or p_mode not in ('rows', 'reverse_all') then
    raise exception 'Invalid order stock claim' using errcode = '22023';
  end if;
  if p_mode = 'reverse_all' and (p_reason <> 'void' or p_kind <> 'order') then
    raise exception 'Only a cancellation reverses an order' using errcode = '22023';
  end if;
  if p_mode = 'rows' and (p_movements is null or jsonb_typeof(p_movements) <> 'array') then
    raise exception 'Invalid order stock movements' using errcode = '22023';
  end if;
  if p_mode = 'rows' and jsonb_array_length(p_movements) > v_max_rows then
    raise exception 'Too many order stock movements' using errcode = '22023';
  end if;

  -- One order at a time: a sale, its edits and its cancellation never
  -- interleave. Namespaced so it never contends with the simple-option RPC.
  perform pg_advisory_xact_lock(
    hashtextextended('order-stock:' || p_tenant_id::text || ':' || p_order_id, 0)
  );

  if exists (
    select 1 from public.order_stock_applications c
     where c.tenant_id = p_tenant_id and c.order_id = p_order_id
       and c.reason = p_reason and c.kind = p_kind and c.revision = p_revision
  ) then
    return jsonb_build_object('status', 'duplicate', 'rows', '[]'::jsonb);
  end if;

  if p_kind = 'order' and p_reason = 'sale' and exists (
    select 1 from public.order_stock_applications c
     where c.tenant_id = p_tenant_id and c.order_id = p_order_id
       and c.kind = 'order' and c.reason = 'void' and c.revision >= p_revision
  ) then
    return jsonb_build_object('status', 'cancelled_first', 'rows', '[]'::jsonb);
  end if;

  if p_kind = 'edit' then
    select coalesce(max(c.revision), 0) into v_latest_sale
      from public.order_stock_applications c
     where c.tenant_id = p_tenant_id and c.order_id = p_order_id
       and c.kind = 'order' and c.reason = 'sale';
    if exists (
      select 1 from public.order_stock_applications c
       where c.tenant_id = p_tenant_id and c.order_id = p_order_id
         and c.kind = 'order' and c.reason = 'void' and c.revision >= v_latest_sale
    ) then
      return jsonb_build_object('status', 'cancelled_first', 'rows', '[]'::jsonb);
    end if;
  end if;

  if p_mode = 'reverse_all' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'inventory_item_id', n.inventory_item_id,
             'outlet_id', n.outlet_id,
             'reason', 'void',
             'quantity_delta', -n.delta,
             'entered_quantity', case when n.entered = 0 then null else abs(n.entered) end,
             'entered_unit_id', n.entered_unit_id)), '[]'::jsonb)
      into v_rows
      from (
        select m.inventory_item_id, m.outlet_id, m.entered_unit_id,
               sum(m.quantity_delta) as delta,
               sum(coalesce(m.entered_quantity, 0) * sign(m.quantity_delta)) as entered
          from public.stock_movements m
         where m.tenant_id = p_tenant_id and m.order_id = p_order_id
         group by m.inventory_item_id, m.outlet_id, m.entered_unit_id
        having sum(m.quantity_delta) <> 0
      ) n;
  else
    v_rows := p_movements;
  end if;

  if p_kind = 'edit' then
    -- What this order still holds per ingredient + branch, positive = out.
    select coalesce(jsonb_object_agg(h.k, h.held), '{}'::jsonb) into v_held
      from (
        select m.inventory_item_id::text || '|' || coalesce(m.outlet_id::text, '') as k,
               -sum(m.quantity_delta) as held
          from public.stock_movements m
         where m.tenant_id = p_tenant_id and m.order_id = p_order_id
         group by m.inventory_item_id, m.outlet_id
      ) h;
  end if;

  insert into public.order_stock_applications (tenant_id, order_id, reason, kind, revision)
  values (p_tenant_id, p_order_id, p_reason, p_kind, p_revision);

  for v_row in select value from jsonb_array_elements(v_rows) loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row -> 'quantity_delta') is distinct from 'number'
       or jsonb_typeof(v_row -> 'inventory_item_id') is distinct from 'string' then
      raise exception 'Invalid order stock movement' using errcode = '22023';
    end if;
    v_item := (v_row ->> 'inventory_item_id')::uuid;
    v_outlet := nullif(v_row ->> 'outlet_id', '')::uuid;
    v_unit := nullif(v_row ->> 'entered_unit_id', '')::uuid;
    v_reason := v_row ->> 'reason';
    v_delta := (v_row ->> 'quantity_delta')::numeric;
    v_entered := case when jsonb_typeof(v_row -> 'entered_quantity') = 'number'
                      then (v_row ->> 'entered_quantity')::numeric end;
    if v_reason is null or v_reason not in ('sale', 'void') or v_delta = 0
       or (v_entered is not null and v_entered < 0) then
      raise exception 'Invalid order stock movement' using errcode = '22023';
    end if;

    if p_kind = 'edit' and v_delta > 0 then
      v_key := v_item::text || '|' || coalesce(v_outlet::text, '');
      v_remaining := greatest(coalesce((v_held ->> v_key)::numeric, 0), 0);
      v_capped := least(v_delta, v_remaining);
      if v_capped <= 0 then
        continue;
      end if;
      if v_capped < v_delta and v_entered is not null then
        v_entered := v_entered * v_capped / v_delta;
      end if;
      v_delta := v_capped;
      v_held := jsonb_set(v_held, array[v_key], to_jsonb(v_remaining - v_capped));
    elsif p_kind = 'edit' then
      v_key := v_item::text || '|' || coalesce(v_outlet::text, '');
      v_held := jsonb_set(v_held, array[v_key],
        to_jsonb(coalesce((v_held ->> v_key)::numeric, 0) - v_delta));
    end if;

    insert into public.stock_movements (
      tenant_id, inventory_item_id, outlet_id, reason,
      quantity_delta, entered_quantity, entered_unit_id, order_id
    ) values (
      p_tenant_id, v_item, v_outlet, v_reason,
      v_delta, v_entered, v_unit, p_order_id
    );

    v_written := v_written || jsonb_build_array(jsonb_build_object(
      'inventory_item_id', v_item,
      'outlet_id', v_outlet,
      'reason', v_reason,
      'quantity_delta', v_delta,
      'entered_quantity', v_entered,
      'entered_unit_id', v_unit));
  end loop;

  if p_mode = 'reverse_all' and jsonb_array_length(v_written) > 0 then
    update public.order_stock_applications c
       set restored = v_written
     where c.tenant_id = p_tenant_id and c.order_id = p_order_id
       and c.reason = 'void' and c.kind = 'order' and c.revision = p_revision;
  end if;

  return jsonb_build_object('status', 'applied', 'rows', v_written);
end;
$$;

revoke all on function public.apply_order_stock_claim(uuid, text, text, text, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.apply_order_stock_claim(uuid, text, text, text, integer, jsonb, text)
  to service_role;

comment on function public.apply_order_stock_claim(uuid, text, text, text, integer, jsonb, text) is
  'Order stock claim + ledger rows in one transaction (service role). Returns {status: applied|duplicate|cancelled_first, rows}.';

-- Rollback (manual):
--   drop function if exists public.apply_order_stock_claim(uuid, text, text, text, integer, jsonb, text);
