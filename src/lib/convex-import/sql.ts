/**
 * The import plan → two SQL files an operator reviews and applies by hand.
 *
 * Each file is ONE `DO` statement, so it is atomic however it is sent:
 * `psql -v ON_ERROR_STOP=1 -f`, the SQL editor, or the Supabase MCP
 * `execute_sql` (which does NOT wrap a script in a transaction block: a lone
 * SAVEPOINT there fails with 25P01). No BEGIN/COMMIT inside; any RAISE rolls
 * the whole statement back.
 *
 * Import file, in order:
 *   1. refuse the wrong store, a live-loyalty store, or a payload for another store
 *   2. `app.order_restore = on` (trg_assign_daily_order_number keeps the Convex
 *      daily number / date, orders_notify_push stays silent) and
 *      `app.store_activity_backfill = on` (store_activity_write drops the
 *      after-hours flag it would otherwise put on old payments)
 *   3. product costs first (order_items_cost_snapshot reads them per line)
 *   4. orders → items → payments → revisions, creation order, only ids not
 *      already present (a BEFORE INSERT guard such as the refund check would
 *      otherwise judge a row that `on conflict do nothing` then drops)
 *   5. rekey stock claims written under the Convex order id
 *   6. cost snapshots dated at the sale; `updated_at = created_at` on the
 *      orders this run inserted (payments stamped them via
 *      order_payments_sync_amount_paid → orders_set_updated_at), under a
 *      transaction-local `session_replication_role = replica` for that one
 *      UPDATE because nothing else stops set_updated_at
 *   7. a final check that RAISES unless the database now holds exactly the
 *      plan's counts and peso totals.
 *
 * Switch file: refuses unless every imported order is present with the plan's
 * total, then `order_backend = 'platform'`, `convex_deployment_url = NULL`
 * (`tenant_secrets.convex_deploy_key` is kept for a delta export).
 */
import type { ImportPlan } from './plan'
import { REKEY_TABLES } from './types'

const ORDER_COLUMNS = [
  'id', 'tenant_id', 'customer_name', 'customer_contact', 'total', 'status', 'created_at', 'updated_at',
  'order_type_id', 'order_type', 'customer_data', 'delivery_fee', 'service_charge_amount', 'scheduled_for',
  'payment_method_id', 'payment_method_name', 'payment_method_details', 'payment_status', 'payment_proof_url',
  'payment_proof_public_id', 'payment_proof_reference', 'source', 'client_order_id', 'item_count',
  'has_upsell_items', 'has_bundle_items', 'outlet_id', 'amount_paid', 'revision_number', 'edited_at', 'edited_by',
  'discount_total', 'discount_data', 'lalamove_quotation_id', 'lalamove_order_id', 'lalamove_status',
  'lalamove_driver_name', 'lalamove_driver_phone', 'lalamove_tracking_url', 'prep_minutes', 'promised_ready_at',
  'daily_number', 'order_date',
] as const

const ITEM_COLUMNS = [
  'id', 'order_id', 'menu_item_id', 'menu_item_name', 'variation', 'addons', 'addon_details', 'quantity', 'price',
  'subtotal', 'special_instructions', 'variation_selections', 'is_upsell_item', 'is_bundle_item', 'bundle_id',
  'bundle_name', 'slot_name',
] as const

const PAYMENT_COLUMNS = [
  'id', 'tenant_id', 'order_id', 'kind', 'amount', 'payment_method_id', 'payment_method_name', 'reference',
  'proof_url', 'proof_public_id', 'recorded_by', 'outlet_id', 'note', 'created_at',
] as const

const REVISION_COLUMNS = [
  'id', 'tenant_id', 'order_id', 'revision_number', 'items_before', 'items_after', 'total_before', 'total_after',
  'reason', 'revised_by', 'outlet_id', 'created_at',
] as const

const COST_COLUMNS = ['id', 'tenant_id', 'menu_item_id', 'cost_price', 'cost_notes', 'created_at', 'updated_at'] as const

export const IMPORT_COLUMNS = {
  orders: ORDER_COLUMNS,
  order_items: ITEM_COLUMNS,
  order_payments: PAYMENT_COLUMNS,
  order_revisions: REVISION_COLUMNS,
  product_costs: COST_COLUMNS,
}

/** Links that may have been deleted between the plan and the apply: kept only while they still exist in this store. */
const ORDER_OVERRIDES: Partial<Record<(typeof ORDER_COLUMNS)[number], string>> = {
  order_type_id:
    'case when exists (select 1 from public.order_types t where t.id = r.order_type_id and t.tenant_id = v_tenant) then r.order_type_id end',
  payment_method_id:
    'case when exists (select 1 from public.payment_methods m where m.id = r.payment_method_id and m.tenant_id = v_tenant) then r.payment_method_id end',
  outlet_id:
    'case when exists (select 1 from public.outlets b where b.id = r.outlet_id and b.tenant_id = v_tenant) then r.outlet_id end',
}

const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`

/** jsonb refuses U+0000; strip it from every string (counted, so the plan can say so). */
export function withoutNulChars<T>(value: T): { value: T; removed: number } {
  let removed = 0
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      if (!node.includes('\u0000')) return node
      removed += node.split('\u0000').length - 1
      return node.replace(/\u0000/g, '')
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, child]) => [key, walk(child)]))
    }
    return node
  }
  return { value: walk(value) as T, removed }
}

function dollarTag(body: string, base: string): string {
  let tag = `$${base}$`
  let n = 0
  while (body.includes(tag)) tag = `$${base}${++n}$`
  return tag
}

function selectList(columns: readonly string[], overrides: Partial<Record<string, string>> = {}): string {
  return columns.map((column) => overrides[column] ?? `r.${column}`).join(',\n      ')
}

export interface ImportSqlOptions {
  /** ISO timestamp written into the header; injectable so tests are deterministic. */
  generatedAt: string
  sourceLabel: string
}

export function buildImportSql(plan: ImportPlan, options: ImportSqlOptions): string {
  const { summary, rows } = plan
  if (plan.problems.some((problem) => problem.severity === 'block')) {
    throw new Error(`Refusing to write SQL: blocking problems (${plan.problems.filter((p) => p.severity === 'block').map((p) => p.code).join(', ')})`)
  }
  const { value: payload } = withoutNulChars({
    orders: rows.orders,
    order_items: rows.order_items,
    order_payments: rows.order_payments,
    order_revisions: rows.order_revisions,
    product_costs: rows.product_costs,
    id_map: rows.idMap,
  })
  const json = JSON.stringify(payload)
  const payloadTag = dollarTag(json, 'wn_payload')
  const outerTag = dollarTag(json, 'wn_import')
  const tenant = sqlText(summary.tenantId)
  const rekeys = REKEY_TABLES.map(
    (table) => `  update public.${table} t set order_id = m.value
    from jsonb_each_text(v_payload -> 'id_map') m
   where t.tenant_id = v_tenant and t.order_id = m.key and t.order_id <> m.value;
  get diagnostics v_n = row_count;
  if v_n > 0 then raise notice 'rekeyed % ${table} row(s) to the platform order id', v_n; end if;`
  ).join('\n')
  const leftKeyed = REKEY_TABLES.map(
    (table) =>
      `(select count(*) from public.${table} t where t.tenant_id = v_tenant and t.order_id in (select k from jsonb_object_keys(v_payload -> 'id_map') k))`
  ).join(' + ')

  const e = {
    orders: rows.orders.length,
    ordersCents: summary.orders.cents,
    amountPaidCents: summary.orders.amountPaidCents,
    items: rows.order_items.length,
    itemsCents: summary.items.cents,
    charges: summary.payments.charges.count,
    chargeCents: summary.payments.charges.cents,
    refunds: summary.payments.refunds.count,
    refundCents: summary.payments.refunds.cents,
    revisions: rows.order_revisions.length,
    costs: rows.product_costs.length,
  }

  return `-- Convex → platform order history import (generated ${options.generatedAt})
-- Store: ${summary.slug} (${summary.tenantId})
-- Source: ${options.sourceLabel}
-- Orders ${e.orders} (₱${(e.ordersCents / 100).toFixed(2)}), items ${e.items}, payments ${e.charges}+${e.refunds} refunds, revisions ${e.revisions}, product costs ${e.costs}
-- First ${summary.firstOrderAt ?? '-'} · last ${summary.lastOrderAt ?? '-'}
--
-- ONE statement: atomic in psql (-v ON_ERROR_STOP=1 -f), the SQL editor, or MCP execute_sql.
-- Re-running it changes nothing (only missing ids are inserted). Any mismatch RAISES and rolls back.
-- Apply ${summary.slug}-switch.sql only after this succeeds.
do ${outerTag}
declare
  v_tenant constant uuid := ${tenant};
  v_payload constant jsonb := ${payloadTag}${json}${payloadTag}::jsonb;
  v_order_ids uuid[];
  v_new_order_ids uuid[];
  v_item_ids uuid[];
  v_n bigint;
  v_cents bigint;
  v_n2 bigint;
  v_cents2 bigint;
begin
  -- 1. The right store, nothing live that would re-earn, a payload for this store only.
  if not exists (select 1 from public.tenants where id = v_tenant and slug = ${sqlText(summary.slug)}) then
    raise exception 'convex import: store % / ${summary.slug} not found', v_tenant;
  end if;
  if exists (select 1 from public.tenants where id = v_tenant and loyalty_enabled and not coalesce(loyalty_shadow, false)) then
    raise exception 'convex import: loyalty is live for this store; importing would queue stamp earning for history';
  end if;
  if exists (select 1 from jsonb_array_elements(v_payload -> 'orders') o where (o ->> 'tenant_id')::uuid <> v_tenant) then
    raise exception 'convex import: payload holds another store''s orders';
  end if;

  select coalesce(array_agg((o ->> 'id')::uuid), '{}') into v_order_ids from jsonb_array_elements(v_payload -> 'orders') o;
  select coalesce(array_agg((i ->> 'id')::uuid), '{}') into v_item_ids from jsonb_array_elements(v_payload -> 'order_items') i;
  select coalesce(array_agg(x), '{}') into v_new_order_ids
    from unnest(v_order_ids) x where not exists (select 1 from public.orders o where o.id = x);
  raise notice 'convex import: % order(s) in the payload, % not yet on the platform', cardinality(v_order_ids), cardinality(v_new_order_ids);

  -- 2. Restore mode (transaction-local).
  perform set_config('app.order_restore', 'on', true);
  perform set_config('app.store_activity_backfill', 'on', true);

  -- 3. Product costs (an existing platform cost for the dish wins).
  insert into public.product_costs (${COST_COLUMNS.join(', ')})
  select ${COST_COLUMNS.map((c) => `r.${c}`).join(', ')}
    from jsonb_populate_recordset(null::public.product_costs, v_payload -> 'product_costs') r
   where exists (select 1 from public.menu_items mi where mi.id = r.menu_item_id and mi.tenant_id = v_tenant)
  on conflict do nothing;

  -- 4a. Orders, oldest first.
  insert into public.orders (
      ${ORDER_COLUMNS.join(', ')},
      customer_id)
  select ${selectList(ORDER_COLUMNS, ORDER_OVERRIDES)},
      (select ceo.customer_id from public.customer_external_orders ceo
        where ceo.tenant_id = v_tenant and ceo.backend = 'convex'
          and ceo.external_order_id = r.customer_data ->> 'convex_order_id'
        order by ceo.updated_at desc limit 1)
    from jsonb_populate_recordset(null::public.orders, v_payload -> 'orders') r
   where r.id = any(v_new_order_ids)
   order by r.created_at, r.id
  on conflict (id) do nothing;

  -- 4b. Lines, only for orders inserted now (an order edited after an earlier
  --     run is NOT patched: the final check fails and says so).
  insert into public.order_items (${ITEM_COLUMNS.join(', ')})
  select ${selectList(ITEM_COLUMNS, {
    menu_item_id:
      'case when exists (select 1 from public.menu_items mi where mi.id = r.menu_item_id and mi.tenant_id = v_tenant) then r.menu_item_id end',
  })}
    from jsonb_populate_recordset(null::public.order_items, v_payload -> 'order_items') r
   where r.order_id = any(v_new_order_ids)
     and not exists (select 1 from public.order_items x where x.id = r.id)
   order by r.order_id, r.id
  on conflict (id) do nothing;

  -- 4c. The ledger, in the order the refund guard expects (charges before their refunds).
  insert into public.order_payments (${PAYMENT_COLUMNS.join(', ')})
  select ${selectList(PAYMENT_COLUMNS, {
    outlet_id:
      'case when exists (select 1 from public.outlets b where b.id = r.outlet_id and b.tenant_id = v_tenant) then r.outlet_id end',
  })}
    from jsonb_populate_recordset(null::public.order_payments, v_payload -> 'order_payments') r
   where not exists (select 1 from public.order_payments x where x.id = r.id)
   order by r.created_at, r.id
  on conflict (id) do nothing;

  -- 4d. Edits.
  insert into public.order_revisions (${REVISION_COLUMNS.join(', ')})
  select ${selectList(REVISION_COLUMNS, {
    outlet_id:
      'case when exists (select 1 from public.outlets b where b.id = r.outlet_id and b.tenant_id = v_tenant) then r.outlet_id end',
  })}
    from jsonb_populate_recordset(null::public.order_revisions, v_payload -> 'order_revisions') r
   where not exists (select 1 from public.order_revisions x where x.id = r.id)
   order by r.created_at, r.id
  on conflict (id) do nothing;

  -- 5. Stock claims written under the Convex order id → the platform order id.
${rekeys}

  -- 6a. Cost snapshots made by this run are dated at the sale, not today.
  update public.order_item_costs c set costed_at = o.created_at
    from public.order_items i join public.orders o on o.id = i.order_id
   where c.order_item_id = i.id and i.id = any(v_item_ids) and o.id = any(v_new_order_ids) and c.costed_at = now();

  -- 6b. Payments stamped updated_at = now() on the orders inserted now; put the sale time back.
  --     set_updated_at ignores order_restore, so only replica mode (this one UPDATE) gets past it.
  perform set_config('session_replication_role', 'replica', true);
  update public.orders set updated_at = created_at
   where tenant_id = v_tenant and id = any(v_new_order_ids) and updated_at is distinct from created_at;
  get diagnostics v_n = row_count;
  perform set_config('session_replication_role', 'origin', true);
  raise notice 'convex import: reset updated_at on % order(s)', v_n;
  perform set_config('app.order_restore', '', true);
  perform set_config('app.store_activity_backfill', '', true);

  -- 7. The database must now hold exactly the plan.
  select count(*), coalesce(sum(round(total * 100)), 0) into v_n, v_cents
    from public.orders where tenant_id = v_tenant and id = any(v_order_ids);
  if v_n <> ${e.orders} or v_cents <> ${e.ordersCents} then
    raise exception 'convex import: orders % / % centavos, expected ${e.orders} / ${e.ordersCents}', v_n, v_cents;
  end if;
  select coalesce(sum(round(amount_paid * 100)), 0) into v_cents
    from public.orders where tenant_id = v_tenant and id = any(v_order_ids);
  if v_cents <> ${e.amountPaidCents} then
    raise exception 'convex import: amount_paid % centavos, expected ${e.amountPaidCents}', v_cents;
  end if;
  select count(*), coalesce(sum(round(subtotal * 100)), 0) into v_n, v_cents
    from public.order_items where id = any(v_item_ids) and order_id = any(v_order_ids);
  if v_n <> ${e.items} or v_cents <> ${e.itemsCents} then
    raise exception 'convex import: order lines % / % centavos, expected ${e.items} / ${e.itemsCents} (an order edited in Convex after an earlier run?)', v_n, v_cents;
  end if;
  select count(*) filter (where kind = 'charge'), coalesce(sum(round(amount * 100)) filter (where kind = 'charge'), 0),
         count(*) filter (where kind = 'refund'), coalesce(sum(round(amount * 100)) filter (where kind = 'refund'), 0)
    into v_n, v_cents, v_n2, v_cents2
    from public.order_payments
   where tenant_id = v_tenant
     and id in (select (p ->> 'id')::uuid from jsonb_array_elements(v_payload -> 'order_payments') p);
  if v_n <> ${e.charges} or v_cents <> ${e.chargeCents} or v_n2 <> ${e.refunds} or v_cents2 <> ${e.refundCents} then
    raise exception 'convex import: payments %/% refunds %/%, expected ${e.charges}/${e.chargeCents} refunds ${e.refunds}/${e.refundCents}', v_n, v_cents, v_n2, v_cents2;
  end if;
  select count(*) into v_n from public.order_revisions
   where tenant_id = v_tenant
     and id in (select (r ->> 'id')::uuid from jsonb_array_elements(v_payload -> 'order_revisions') r);
  if v_n <> ${e.revisions} then
    raise exception 'convex import: revisions %, expected ${e.revisions}', v_n;
  end if;
  select count(*) into v_n from public.product_costs
   where tenant_id = v_tenant
     and menu_item_id in (select (c ->> 'menu_item_id')::uuid from jsonb_array_elements(v_payload -> 'product_costs') c);
  if v_n <> ${e.costs} then
    raise exception 'convex import: product costs %, expected ${e.costs}', v_n;
  end if;
  select count(*) into v_n
    from public.orders o join jsonb_populate_recordset(null::public.orders, v_payload -> 'orders') r on r.id = o.id
   where o.order_date is distinct from r.order_date or o.daily_number is distinct from r.daily_number;
  if v_n <> 0 then
    raise exception 'convex import: % order(s) lost their daily number', v_n;
  end if;
  select count(*) into v_n from public.orders
   where id = any(v_new_order_ids) and updated_at is distinct from created_at;
  if v_n <> 0 then
    raise exception 'convex import: % imported order(s) carry today''s updated_at', v_n;
  end if;
  v_n := ${leftKeyed};
  if v_n <> 0 then
    raise exception 'convex import: % stock row(s) still keyed by a Convex order id', v_n;
  end if;
  raise notice 'convex import: OK (% orders, % centavos)', ${e.orders}, ${e.ordersCents};
end
${outerTag};
`
}

export interface SwitchSqlOptions {
  generatedAt: string
  /** The deployment URL the store pointed at when the plan was made (NULL accepted too). */
  expectedDeploymentUrl: string | null
}

export function buildSwitchSql(plan: ImportPlan, options: SwitchSqlOptions): string {
  const { summary, rows } = plan
  const ids = rows.orders.map((row) => sqlText(row.id)).join(',')
  const url = options.expectedDeploymentUrl ? sqlText(options.expectedDeploymentUrl) : 'null'
  return `-- Switch ${summary.slug} (${summary.tenantId}) to the platform order backend (generated ${options.generatedAt})
-- Refuses unless all ${rows.orders.length} imported orders (₱${(summary.orders.cents / 100).toFixed(2)}) are present.
-- Keeps tenant_secrets.convex_deploy_key so a delta can still be exported.
-- Newest imported Convex record: ${summary.newestCreationTime ? new Date(summary.newestCreationTime).toISOString() : '-'}; run \`delta\` afterwards.
do $wn_switch$
declare
  v_tenant constant uuid := ${sqlText(summary.tenantId)};
  v_ids constant uuid[] := array[${ids}]::uuid[];
  v_n bigint;
  v_cents bigint;
  v_url text;
begin
  select count(*), coalesce(sum(round(total * 100)), 0) into v_n, v_cents
    from public.orders where tenant_id = v_tenant and id = any(v_ids);
  if v_n <> ${rows.orders.length} or v_cents <> ${summary.orders.cents} then
    raise exception 'switch refused: % imported order(s) / % centavos on the platform, expected ${rows.orders.length} / ${summary.orders.cents}. Apply the import first.', v_n, v_cents;
  end if;
  select convex_deployment_url into v_url from public.tenants where id = v_tenant and slug = ${sqlText(summary.slug)};
  if not found then
    raise exception 'switch refused: store not found';
  end if;
  if v_url is not null and v_url is distinct from ${url} then
    raise exception 'switch refused: the store now points at a different Convex deployment (%)', v_url;
  end if;
  update public.tenants set order_backend = 'platform', convex_deployment_url = null where id = v_tenant;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'switch refused: updated % store rows', v_n;
  end if;
  raise notice 'switched ${summary.slug} to platform';
end
$wn_switch$;
`
}
