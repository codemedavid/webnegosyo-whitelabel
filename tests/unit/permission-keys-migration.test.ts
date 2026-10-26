/**
 * Phase 0d migrations, pinned to the TypeScript registry they mirror.
 *
 *   20261013120050  app_user_has_permission learns `reports` <- `analytics`
 *                   (APPLIED 2026-10-13)
 *   20261013120100  backfill inventory+costs onto menu holders; stock/cost
 *                   gates move off `menu`            (apply WITH the deploy)
 *   20261013120200  HIGH-3: order reads need an order-reading key
 *                                                     (apply WITH the deploy)
 *
 * The SQL and the registry are two copies of one rule; these tests fail when
 * one moves without the other. Behaviour was probed on the live database
 * inside rolled-back transactions (docs/testing/permission-keys.tdd.md).
 */
import { readFileSync } from 'fs'
import path from 'path'
import { IMPLIED_BY, OPT_IN_PERMISSION_KEYS, ORDER_READ_KEYS, PAYMENT_READ_KEYS } from '@/lib/staff-permissions'

const migration = (name: string): string =>
  readFileSync(path.join(process.cwd(), 'supabase', 'migrations', name), 'utf8')

/** The executable SQL only: comments say what the code must not be trusted to. */
const code = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

const KEYS = code(migration('20261013120050_staff_permission_keys.sql'))
const GATES = code(migration('20261013120100_inventory_costs_permission_gates.sql'))
const ORDERS = code(migration('20261013120200_order_reads_need_permission.sql'))

/** The body of `create or replace function public.<name>` up to its closing $$. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const open = sql.indexOf('$$', start)
  const close = sql.indexOf('$$', open + 2)
  return sql.slice(open, close)
}

function sqlArray(keys: readonly string[]): string {
  return `array[${keys.map((key) => `'${key}'`).join(', ')}]`
}

describe('20261013120050 app_user_has_permission', () => {
  const body = functionBody(KEYS, 'app_user_has_permission')

  it('honours every IMPLIED_BY containment of the registry', () => {
    expect(body).toContain("(p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))")
    expect(body).toContain("(p_permission = 'reports' and 'analytics' = any (au.permissions))")
    expect(Object.keys(IMPLIED_BY).sort()).toEqual(['kitchen', 'reports', 'tables'])
  })

  it('keeps the live opt-in keys out of legacy full access (store-activity branch)', () => {
    expect(body).toContain("au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests'])")
  })

  it('stays a definer function nobody anonymous can call', () => {
    expect(KEYS).toMatch(/security definer\s+set search_path = ''/)
    expect(KEYS).toContain('revoke all on function public.app_user_has_permission(uuid, text) from public, anon;')
    expect(KEYS).toContain('grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;')
  })

  it('backfills nobody: it only teaches the rule', () => {
    expect(KEYS).not.toMatch(/update public\.app_users/)
  })
})

describe('20261022130200 expenses is opt-in', () => {
  const OPT_IN = code(migration('20261022130200_expenses_opt_in.sql'))
  const body = functionBody(OPT_IN, 'app_user_has_permission')

  it('keeps every opt-in key of the registry out of legacy full access', () => {
    expect(body).toContain(`au.permissions is null and p_permission <> all (${sqlArray(OPT_IN_PERMISSION_KEYS)})`)
    expect(OPT_IN_PERMISSION_KEYS).toContain('expenses')
  })

  it('keeps the containments, the definer shape and the grants', () => {
    expect(body).toContain("(p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))")
    expect(body).toContain("(p_permission = 'reports' and 'analytics' = any (au.permissions))")
    expect(OPT_IN).toMatch(/security definer\s+set search_path = ''/)
    expect(OPT_IN).toContain('revoke all on function public.app_user_has_permission(uuid, text) from public, anon;')
    expect(OPT_IN).toContain('grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;')
    expect(OPT_IN).not.toMatch(/update public\.app_users/)
  })
})

describe('20261013120100 backfill and stock/cost gates', () => {
  it('backfills only scoped, non-owner menu holders, with triggers off for that statement', () => {
    const backfill = GATES.slice(GATES.indexOf('set session_replication_role = replica;'), GATES.indexOf('set session_replication_role = origin;'))
    expect(backfill).toContain("unnest(array['inventory', 'costs'])")
    expect(backfill).toContain("au.role = 'admin'")
    expect(backfill).toContain('au.is_owner is not true')
    expect(backfill).toContain('au.permissions is not null')
    expect(backfill).toContain("'menu' = any (au.permissions)")
  })

  it('moves recording stock and branch shelves to inventory', () => {
    expect(functionBody(GATES, 'stock_movements_client_guard')).toContain("app_user_has_permission(new.tenant_id, 'inventory')")
    expect(functionBody(GATES, 'stock_movements_client_guard')).not.toContain("'menu'")
    expect(functionBody(GATES, 'inventory_stock_client_guard')).toContain("app_user_has_permission(v_tenant, 'inventory')")
    expect(GATES).toContain("public.app_user_may_reach_branch(tenant_id, outlet_id) and public.app_user_has_permission(tenant_id, 'inventory')")
  })

  it('drops a delivery price from an account without costs: a priced receive rewrites the ingredient cost', () => {
    const guard = functionBody(GATES, 'stock_movements_client_guard')
    expect(guard).toMatch(/new\.unit_cost is not null and not \(\s*public\.app_user_has_permission\(new\.tenant_id, 'costs'\)/)
    expect(guard).toContain('new.unit_cost := null;')
  })

  it('splits the ingredient row: master = menu, price = costs, reorder level = inventory', () => {
    const guard = functionBody(GATES, 'inventory_items_client_guard')
    expect(guard).toMatch(/new\.name, new\.sku, new\.category, new\.stock_unit_id, new\.is_prep, new\.image_url, new\.is_active[\s\S]*'menu'/)
    expect(guard).toMatch(/new\.unit_cost is distinct from old\.unit_cost[\s\S]*'costs'/)
    expect(guard).toMatch(/new\.reorder_level is distinct from old\.reorder_level[\s\S]*'inventory'/)
    // The 0a invariants survive the rewrite.
    expect(guard).toContain('Stock on hand changes only through a delivery, waste, count or transfer.')
    expect(guard).toContain('pg_trigger_depth() > 1')
  })

  it('puts the frozen dish cost of every sale behind costs', () => {
    expect(GATES).toContain('rename to order_item_costs_select_costs')
    expect(GATES).toContain("using (public.app_user_has_permission(tenant_id, 'costs')")
  })

  it('needs inventory to write counts and transfer paperwork', () => {
    for (const table of ['inventory_counts', 'stock_transfers', 'stock_transfer_lines']) {
      expect(GATES).toContain(`before insert or update or delete on public.${table}`)
    }
    expect(functionBody(GATES, 'inventory_write_needs_grant')).toContain("'inventory'")
  })

  it('leaves the low-stock bell to its own workstream', () => {
    expect(GATES).not.toContain('app_user_may_read_merchant_notifications')
  })
})

describe('20261013120200 order reads need a permission (HIGH-3)', () => {
  it('uses exactly the registry key sets', () => {
    expect(ORDERS).toContain(sqlArray(ORDER_READ_KEYS))
    // reads: payments + revisions; writes: payments + revisions
    expect(ORDERS.split(sqlArray(PAYMENT_READ_KEYS))).toHaveLength(5)
    // reads: orders; writes: insert + update (using + check)
    expect(ORDERS.split(sqlArray(ORDER_READ_KEYS))).toHaveLength(5)
  })

  it('narrows reads AND staff writes on orders, payments and revisions, and nothing else', () => {
    const altered = [...ORDERS.matchAll(/alter policy (\w+) on public\.(\w+)/g)].map((m) => `${m[2]}.${m[1]}`)
    expect(altered).toEqual([
      'orders.orders_select_by_tenant',
      'order_payments.order_payments_select',
      'order_revisions.order_revisions_select',
      'orders.orders_insert_admin',
      'orders.orders_update_admin',
      'order_payments.order_payments_insert_admin',
      'order_revisions.order_revisions_insert_admin',
    ])
  })

  it('keeps the refund grant on payment inserts', () => {
    expect(ORDERS).toContain("(kind <> 'refund' or public.app_user_has_permission(tenant_id, 'order_refund'))")
  })

  it('evaluates the check once per statement, not once per row', () => {
    expect(ORDERS).toContain('(select public.app_user_holds_any_permission(\n        (select public.app_user_admin_tenant_id()),')
  })

  it('lets anon call the check so an anonymous read stays empty instead of failing', () => {
    expect(ORDERS).toContain('grant execute on function public.app_user_holds_any_permission(uuid, text[]) to anon, authenticated, service_role;')
  })
})

describe('20261027120100 cash_manage carved out of store_setup', () => {
  const CASH = code(migration('20261027120100_cash_manage_permission.sql'))

  it('backfills only scoped, non-owner store_setup holders, once, with triggers off for that statement', () => {
    const backfill = CASH.slice(CASH.indexOf('set session_replication_role = replica;'), CASH.indexOf('set session_replication_role = origin;'))
    expect(backfill).toContain("array['cash_manage']")
    expect(backfill).toContain("au.role = 'admin'")
    expect(backfill).toContain('au.is_owner is not true')
    expect(backfill).toContain('au.permissions is not null')
    expect(backfill).toContain("'store_setup' = any (au.permissions)")
    expect(backfill).toContain("not ('cash_manage' = any (au.permissions))")
  })

  it('makes app_user_manages_cash the registry key, the same rule as canManageCash', () => {
    const body = functionBody(CASH, 'app_user_manages_cash')
    expect(body).toContain("public.app_user_has_permission(target_tenant_id, 'cash_manage')")
    expect(body).not.toContain('store_setup')
    expect(CASH).toMatch(/security invoker\s+set search_path = ''/)
  })

  it('needs no SQL key list: cash_manage is neither opt-in nor implied, and the live body is left alone', () => {
    expect(OPT_IN_PERMISSION_KEYS).not.toContain('cash_manage')
    expect(Object.keys(IMPLIED_BY)).not.toContain('cash_manage')
    expect(CASH).not.toContain('function public.app_user_has_permission(')
  })
})
