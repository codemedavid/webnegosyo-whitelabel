/**
 * The stock ledger is the only way stock changes.
 *
 * A 2026-10-12 audit found that any staff token — a cashier with only the
 * register — could PATCH `inventory_items.current_qty` / `unit_cost` or
 * `inventory_stock.current_qty` straight through PostgREST (no ledger row, no
 * audit row), insert `stock_movements` claiming to be a `sale`, a waste row
 * that ADDS stock, or a transfer leg for a transfer that doesn't exist, and
 * delete `order_stock_applications` claims so an order deducts twice. Every
 * profit, variance and stock-value figure reads those rows, so the reports
 * suite cannot be built on top of them until the database refuses all of it.
 *
 * Actor/time stamping on `stock_movements` and the `menu` grant on movement
 * inserts belong to the Store Activity security floor
 * (20261012140000_security_floor_activity.sql) and are NOT repeated here.
 *
 * Runs without a database; the live objects are probed by name after apply.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, test, expect } from '@jest/globals'

/** Part 1 guards the ledger; part 2 narrows who writes what decides it. */
const MIGRATIONS = [
  'supabase/migrations/20261012170000_inventory_ledger_guards.sql',
  'supabase/migrations/20261012170100_inventory_write_scopes.sql',
  'supabase/migrations/20261012170200_inventory_guard_hardening.sql',
].map((path) => join(process.cwd(), path))

/** Executable statements only: comments quote old predicates to explain them. */
function executableSql(): string {
  return MIGRATIONS.map((path) => readFileSync(path, 'utf8'))
    .join('\n')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** The body of the LAST `create or replace function public.<name>` (later parts redefine). */
function functionBody(sql: string, name: string): string {
  const start = sql.lastIndexOf(`create or replace function public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2)
  return sql.slice(start, end)
}

describe('inventory ledger guards migration', () => {
  const sql = executableSql()

  test('every guard lets the ledger trigger and server roles through', () => {
    for (const fn of [
      'inventory_items_client_guard',
      'inventory_stock_client_guard',
      'stock_movements_client_guard',
      'stock_transfers_client_guard',
      'stock_transfer_lines_client_guard',
    ]) {
      const body = functionBody(sql, fn)
      // Only client roles are policed; the service role (order depletion) and
      // SECURITY DEFINER functions run as other roles.
      expect(body).toContain("current_user not in ('anon', 'authenticated')")
      expect(body).toContain('set search_path = ')
    }
    // The running total is written BY apply_stock_movement — one level down.
    expect(functionBody(sql, 'inventory_items_client_guard')).toContain('pg_trigger_depth() > 1')
    expect(functionBody(sql, 'inventory_stock_client_guard')).toContain('pg_trigger_depth() > 1')
  })

  test('on-hand quantity can never be written directly by a client', () => {
    const items = functionBody(sql, 'inventory_items_client_guard')
    expect(items).toContain('new.current_qty is distinct from old.current_qty')
    expect(items).toContain('coalesce(new.current_qty, 0) <> 0')

    const stock = functionBody(sql, 'inventory_stock_client_guard')
    expect(stock).toContain('new.current_qty is distinct from old.current_qty')
    expect(stock).toContain('coalesce(new.current_qty, 0) <> 0')
    // No row means ZERO stock: deleting a row is a silent write-off.
    expect(stock).toMatch(/tg_op = 'delete' then raise exception/)
  })

  test('ingredient master writes need the menu grant', () => {
    const items = functionBody(sql, 'inventory_items_client_guard')
    expect(items).toContain("public.app_user_has_permission(v_tenant, 'menu')")
  })

  test('clients may only write the manual reasons, with the right sign', () => {
    const body = functionBody(sql, 'stock_movements_client_guard')
    expect(body).toContain(
      "new.reason not in ('receive', 'stocktake', 'waste', 'transfer_out', 'transfer_in')",
    )
    expect(body).toContain('new.order_id is not null')
    expect(body).toContain("new.reason = 'receive' and new.quantity_delta < 0")
    expect(body).toContain("new.reason = 'waste' and new.quantity_delta > 0")
    expect(body).toContain("new.reason = 'transfer_out' and new.quantity_delta > 0")
    expect(body).toContain("new.reason = 'transfer_in' and new.quantity_delta < 0")
    // A transfer leg must belong to a real transfer of this store, on one of
    // its two shelves.
    expect(body).toContain('from public.stock_transfers t')
    expect(body).toContain('t.tenant_id = new.tenant_id')
  })

  test('the guard runs BEFORE apply_stock_movement changes any total', () => {
    // BEFORE triggers fire in name order; "stock_movements_apply" must come after.
    const name = sql.match(/create trigger (\S+) before insert on public\.stock_movements/)
    expect(name).not.toBeNull()
    expect(name![1] < 'stock_movements_apply').toBe(true)
  })

  test('deduction claims are server-only', () => {
    expect(sql).toContain(
      'revoke insert, update, delete, truncate on public.order_stock_applications from anon, authenticated',
    )
    expect(sql).toContain('drop policy if exists "admins manage own-tenant rows" on public.order_stock_applications')
  })

  test('recipes, components and units need menu on a store-wide account to change', () => {
    for (const table of ['recipes', 'recipe_components', 'inventory_units']) {
      expect(sql).toContain(`drop policy if exists "admins manage own-tenant rows" on public.${table}`)
      for (const op of ['insert', 'update', 'delete']) {
        const policy = sql.match(
          new RegExp(`create policy ${table}_${op}_menu on public\\.${table} for ${op} to authenticated[^;]*;`),
        )
        expect(policy).not.toBeNull()
        expect(policy![0]).toContain("public.app_user_has_permission(tenant_id, 'menu')")
        // A branch-locked account must not rewrite every branch's recipe.
        expect(policy![0]).toContain('public.app_user_may_reach_branch(tenant_id, null)')
      }
      expect(sql).toContain(`create policy ${table}_select_member on public.${table} for select to authenticated`)
    }
  })

  test('delete_inventory_item checks the menu grant and refuses branch-locked accounts', () => {
    const body = functionBody(sql, 'delete_inventory_item')
    expect(body).toContain("public.app_user_has_permission(p_tenant_id, 'menu')")
    expect(body).toContain('public.app_user_may_reach_branch(p_tenant_id, null)')
    expect(body).toContain('security definer')
  })

  test('the receiving branch can only receive', () => {
    const transfers = functionBody(sql, 'stock_transfers_client_guard')
    expect(transfers).toContain('public.app_user_may_reach_branch(old.tenant_id, old.from_outlet_id)')
    const lines = functionBody(sql, 'stock_transfer_lines_client_guard')
    expect(lines).toContain('new.sent_quantity is distinct from old.sent_quantity')
  })

  test('history tables are append-only for clients and nothing is truncatable', () => {
    expect(sql).toContain('revoke update, delete, truncate on public.inventory_audit_log from anon, authenticated')
    for (const table of ['inventory_items', 'inventory_stock', 'stock_movements', 'recipes', 'recipe_components']) {
      expect(sql).toMatch(new RegExp(`revoke truncate on [^;]*public\\.${table}[,; ]`))
    }
  })

  test('reports can read the ledger by time without a sequential scan', () => {
    expect(sql).toContain('on public.stock_movements (tenant_id, created_at desc)')
  })

  test('a client movement needs the menu grant (cashiers cannot add stock)', () => {
    const body = functionBody(sql, 'stock_movements_client_guard')
    expect(body).toContain("public.app_user_has_permission(new.tenant_id, 'menu')")
  })

  test('a transfer leg is bounded by its transfer: item, quantity, status, once', () => {
    const body = functionBody(sql, 'stock_movements_client_guard')
    expect(body).toContain('from public.stock_transfer_lines l')
    expect(body).toContain('abs(new.quantity_delta) > v_sent')
    expect(body).toContain("v_status <> 'draft'")
    expect(body).toContain("v_status <> 'sent'")
    // The same leg twice would credit the same crate twice.
    expect(body).toContain('m.stock_transfer_id = new.stock_transfer_id')
  })

  test('the stock unit cannot change under a non-zero quantity', () => {
    const body = functionBody(sql, 'inventory_items_client_guard')
    expect(body).toContain('new.stock_unit_id is distinct from old.stock_unit_id and old.current_qty <> 0')
  })

  test('platform staff are checked against the grant for the operation', () => {
    for (const fn of ['inventory_items_client_guard', 'inventory_stock_client_guard']) {
      const body = functionBody(sql, fn)
      expect(body).toContain("array['stores.create']")
      expect(body).toContain("array['stores.edit']")
    }
  })
})
