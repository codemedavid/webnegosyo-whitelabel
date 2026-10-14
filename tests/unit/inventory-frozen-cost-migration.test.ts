/**
 * Every stock movement carries the cost it happened at, and the average cost
 * is blended by the ledger itself.
 *
 * Before this, only a delivery stored a price: a sale, a waste or a count read
 * "whatever the ingredient costs today" at report time, so editing a cost
 * rewrote every past month's food cost, and a cancelled order could come back
 * at a different price than it went out at. The weighted average was computed
 * in the web request from an item read before the insert, so two deliveries
 * landing together each blended against the same stale shelf.
 *
 * Dish costs go to their own table (`order_item_costs`), not a column on
 * `order_items`: every staff account that can see an order can read its lines,
 * and a dish's cost is the owner's margin.
 *
 * Runs without a database; the live objects are probed after apply
 * (docs/testing/inventory-frozen-cost.tdd.md).
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, test, expect } from '@jest/globals'

/** Part 2 hardens part 1 after review (cycle guard, no per-row subtransactions on the sale path, 6-place costs). */
const MIGRATIONS = [
  'supabase/migrations/20261012180000_inventory_frozen_cost.sql',
  'supabase/migrations/20261012180100_inventory_frozen_cost_hardening.sql',
].map((path) => join(process.cwd(), path))

/** Executable statements only, whitespace-collapsed and lowercased. */
function executableSql(): string {
  return MIGRATIONS.map((path) => readFileSync(path, 'utf8'))
    .join('\n')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function functionBody(sql: string, name: string): string {
  const start = sql.lastIndexOf(`create or replace function public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2)
  return sql.slice(start, end)
}

describe('inventory frozen cost migration', () => {
  const sql = executableSql()

  describe('cost of an ingredient (mirror of costing.ts)', () => {
    test('a raw ingredient costs its own unit cost, unpriced reading as 0', () => {
      const body = functionBody(sql, 'inventory_effective_unit_cost')
      expect(body).toContain('coalesce(v_unit_cost, 0)')
    })

    test('a prep costs its recipe divided by its yield in the stock unit', () => {
      const body = functionBody(sql, 'inventory_effective_unit_cost')
      expect(body).toContain("r.target_type = 'prep_item'")
      expect(body).toContain('public.inventory_convert_quantity(')
      expect(body).toContain('public.inventory_recipe_cost(')
      expect(body).toMatch(/v_yield_in_stock <= 0 then return null/)
      expect(body).toContain('v_recipe_cost / v_yield_in_stock')
    })

    test('a recipe is unknown, never understated, when a line cannot be priced', () => {
      const body = functionBody(sql, 'inventory_recipe_cost')
      // Missing ingredient, unconvertible unit or unknowable prep: null, as
      // costing.ts throws for the same inputs.
      expect(body).toMatch(/if v_line_cost is null then return null/)
    })

    test('a prep that (indirectly) contains itself is unknown at the first revisit', () => {
      // A depth cap alone let a cycle fan out k^8 times inside a checkout or a
      // sale — long enough to hit the statement timeout, which no handler catches.
      const body = functionBody(sql, 'inventory_effective_unit_cost')
      expect(body).toContain('p_item_id = any(p_path)')
      expect(body).toContain('cardinality(p_path) >= 32')
      expect(body).toContain('p_path || p_item_id')
      expect(functionBody(sql, 'inventory_recipe_cost')).toContain(
        'public.inventory_effective_unit_cost(p_tenant_id, v_line.inventory_item_id, p_path)',
      )
      // The depth-integer overloads are gone, so no call can resolve to them.
      expect(sql).toContain('drop function if exists public.inventory_recipe_cost(uuid, uuid, integer)')
      expect(sql).toContain('drop function if exists public.inventory_effective_unit_cost(uuid, uuid, integer)')
    })

    test('units convert by factor within weight/volume, never across count', () => {
      const body = functionBody(sql, 'inventory_convert_quantity')
      expect(body).toContain("in ('weight', 'volume')")
      expect(body).toContain('p_quantity * v_from_factor / v_to_factor')
    })

    test('the costing helpers are server-only', () => {
      for (const fn of ['inventory_convert_quantity', 'inventory_recipe_cost', 'inventory_effective_unit_cost']) {
        expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`))
        expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`))
        expect(functionBody(sql, fn)).toContain("set search_path = ''")
      }
      expect(sql).toContain('revoke all on function public.inventory_recipe_cost(uuid, uuid, uuid[]) from public, anon, authenticated')
      expect(sql).toContain('revoke all on function public.inventory_effective_unit_cost(uuid, uuid, uuid[]) from public, anon, authenticated')
    })
  })

  describe('the cost frozen on a movement', () => {
    const body = () => functionBody(sql, 'stock_movement_frozen_cost')

    test('is reachable only from inside the ledger trigger', () => {
      expect(body()).toContain('security definer')
      expect(body()).toContain("set search_path = ''")
      expect(body()).toMatch(/if pg_trigger_depth\(\) < 1 then raise exception/)
      expect(sql).toMatch(/revoke all on function public\.stock_movement_frozen_cost\([^)]*\) from public, anon/)
    })

    test('a void reuses the weighted cost of what its order took out', () => {
      expect(body()).toContain("p_reason = 'void'")
      expect(body()).toContain('sum(-m.quantity_delta * m.unit_cost)')
      expect(body()).toContain('m.order_id = p_order_id')
      expect(body()).toContain('m.outlet_id is not distinct from p_outlet_id')
      // A sale written before costs were frozen has none; its void must not
      // invent one, or the cancelled order nets to a negative food cost.
      expect(body()).toMatch(/v_uncosted > 0 then return null/)
    })

    test('a transfer arrival (and its shortfall) reuses the cost it left at', () => {
      expect(body()).toContain("p_reason in ('transfer_in', 'waste')")
      expect(body()).toContain("m.reason = 'transfer_out'")
      expect(body()).toContain('m.stock_transfer_id = p_transfer_id')
    })

    test('never blocks the movement: an unpriceable cost is stored as unknown', () => {
      // Every failure is guarded instead of caught: a catch-all opens a
      // subtransaction per ledger row, and one sale writes many rows in one
      // statement — past 64 that slows every reader of the shared database.
      expect(body()).not.toContain('exception when others')
      // numeric(16,6) tops out below 1e10; an absurd recipe must not overflow.
      expect(body()).toContain('v_cost >= 100000000')
      expect(body()).toContain('round(v_cost, 6)')
    })

    test('an ingredient never priced freezes as unknown, not free', () => {
      expect(body()).toMatch(/if v_cost is null or v_cost <= 0 or v_cost >= 100000000 then return null/)
    })

    test('costs keep six places, so a per-gram price is not rounded by up to 14%', () => {
      expect(sql).toContain('alter table public.stock_movements alter column unit_cost type numeric(16,6)')
      expect(sql).toContain('alter table public.inventory_items alter column unit_cost type numeric(16,6)')
    })
  })

  describe('the ledger trigger', () => {
    const body = () => functionBody(sql, 'apply_stock_movement')

    test('keeps everything it did before', () => {
      expect(body()).toContain('stock movement references a branch outside its tenant')
      expect(body()).toContain('stock movement references an inventory item outside its tenant')
      expect(body()).toContain('new.quantity_delta := new.target_qty - coalesce(counted_against, 0)')
      expect(body()).toContain('exception when unique_violation then')
      expect(body()).toContain('new.balance_after := branch_qty')
      expect(body()).not.toContain('security definer')
    })

    test('reads the shelf and its cost under one row lock', () => {
      expect(body()).toMatch(/select current_qty, unit_cost into rollup_qty, v_item_cost from inventory_items .* for update/)
    })

    test('a delivery keeps the price it was given and blends it into the average', () => {
      expect(body()).toContain("if new.reason = 'receive' then")
      expect(body()).toContain('new.unit_cost is not null and new.quantity_delta > 0')
      // movingAverageUnitCost: an empty, negative or never-priced shelf takes
      // the delivery price outright.
      expect(body()).toContain('when rollup_qty <= 0 or v_item_cost <= 0 then new.unit_cost')
      expect(body()).toContain(
        '(rollup_qty * v_item_cost + new.quantity_delta * new.unit_cost) / (rollup_qty + new.quantity_delta)',
      )
      expect(body()).toContain('unit_cost = coalesce(v_new_item_cost, unit_cost)')
    })

    test('every other movement has its cost set by the database, whatever the caller sent', () => {
      expect(body()).toMatch(
        /else new\.unit_cost := public\.stock_movement_frozen_cost\( new\.tenant_id, new\.inventory_item_id, new\.reason, new\.outlet_id, new\.order_id, new\.stock_transfer_id \)/,
      )
    })

    test('a cost can never be negative', () => {
      expect(sql).toContain('check (unit_cost is null or unit_cost >= 0)')
    })
  })

  describe('order lines', () => {
    test('carry the category they were sold under', () => {
      expect(sql).toContain('alter table public.order_items add column if not exists category_name text')
      const body = functionBody(sql, 'order_items_category_snapshot')
      expect(body).toContain('security definer')
      // Same store only: a line can't borrow another store's menu.
      expect(body).toContain('mi.tenant_id = o.tenant_id')
      expect(body).toContain('c.tenant_id = o.tenant_id')
      // Not editable after the fact: the same dish keeps its first category.
      expect(body).toContain('new.category_name := old.category_name')
      // One guarded select: no catch-all, so no subtransaction per order line.
      expect(body).not.toContain('exception when others')
      expect(sql).toMatch(/create trigger order_items_category_snapshot before insert or update on public\.order_items/)
    })

    test('dish costs live in a table only cost-readers can see', () => {
      expect(sql).toContain('create table if not exists public.order_item_costs')
      expect(sql).toContain('alter table public.order_item_costs enable row level security')
      expect(sql).toContain('revoke all on public.order_item_costs from anon, authenticated')
      expect(sql).toContain('grant select on public.order_item_costs to authenticated')
      expect(sql).toMatch(
        /create policy order_item_costs_select_menu on public\.order_item_costs for select to authenticated using \( public\.app_user_has_permission\(tenant_id, 'menu'\) and public\.app_user_may_reach_branch\(tenant_id, null\) \)/,
      )
      expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*on public\.order_item_costs to (anon|authenticated)/)
    })

    test('a dish is costed from its recipe, else the typed cost, else not at all', () => {
      const body = functionBody(sql, 'order_items_cost_snapshot')
      expect(body).toContain('security definer')
      expect(body).toContain("r.target_type = 'menu_item'")
      expect(body).toContain("v_source := 'recipe'")
      expect(body).toContain('from public.product_costs pc')
      expect(body).toContain("v_source := 'manual'")
      // A checkout must never fail because a dish could not be costed.
      expect(body).toContain('exception when others then')
      expect(sql).toMatch(/create trigger order_items_cost_snapshot after insert or update of menu_item_id on public\.order_items/)
    })

    test('the snapshot triggers are not callable', () => {
      for (const fn of ['order_items_category_snapshot', 'order_items_cost_snapshot']) {
        expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`))
      }
    })
  })
})
