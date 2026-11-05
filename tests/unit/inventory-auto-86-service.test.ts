/**
 * The I/O half of level-based auto-86 (`auto-86-service.ts`).
 *
 * Reads go through `fakeSupabaseTables`, which applies every filter the way
 * PostgREST does — the old service test's mock ignored `.in()`, which is how
 * "recovery reads only the restocked ingredient's component rows, so a dish
 * comes back while its sugar is still at zero" shipped unnoticed.
 */

import { fakeSupabaseTables } from '../fixtures/fake-supabase-tables'

const NOW = new Date('2026-11-03T04:00:00.000Z')
const TENANT = 'tenant-1'

interface WriteCall {
  table: string
  patch: Record<string, unknown>
  filters: Array<[string, string, unknown]>
}

/** The fake for reads, plus a recorder that answers UPDATE … RETURNING id. */
function clientWith(tables: Record<string, object[]>, failures: Record<string, string> = {}) {
  const fake = fakeSupabaseTables(tables, failures)
  const writes: WriteCall[] = []

  const from = (table: string) => {
    const read = fake.client.from(table)
    return {
      ...read,
      select: (...args: unknown[]) => (read.select as (...a: unknown[]) => unknown)(...args),
      update(patch: Record<string, unknown>) {
        const call: WriteCall = { table, patch, filters: [] }
        writes.push(call)
        const builder = {
          eq: (c: string, v: unknown) => (call.filters.push(['eq', c, v]), builder),
          in: (c: string, v: unknown) => (call.filters.push(['in', c, v]), builder),
          not: (c: string, op: string, v: unknown) => (call.filters.push(['not', c, `${op}:${String(v)}`]), builder),
          select: () => {
            const ids = (call.filters.find(([op, c]) => op === 'in' && c === 'id')?.[2] ?? []) as string[]
            return Promise.resolve({ data: ids.map((id) => ({ id })), error: null })
          },
        }
        return builder
      },
    }
  }
  return { client: { from } as never, writes }
}

const PIECE = { id: 'unit-pc', tenant_id: TENANT, name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }

function base(id: string, menuItemId: string) {
  return {
    id, tenant_id: TENANT, target_type: 'menu_item', menu_item_id: menuItemId,
    variation_option_id: null, addon_id: null, modifier_option_id: null, prep_item_id: null,
  }
}
function line(recipeId: string, itemId: string, quantity = 1) {
  return { id: `${recipeId}-${itemId}`, tenant_id: TENANT, recipe_id: recipeId, inventory_item_id: itemId, quantity, unit_id: 'unit-pc' }
}
function ingredient(id: string, qty: number, countedAt: string | null = '2026-10-01T00:00:00.000Z') {
  return { id, tenant_id: TENANT, name: id, stock_unit_id: 'unit-pc', current_qty: qty, is_active: true, counted_at: countedAt }
}
function menuItem(id: string, overrides: Record<string, unknown> = {}) {
  return { id, tenant_id: TENANT, is_available: true, auto_disabled_at: null, auto_86_snoozed_until: null, ...overrides }
}

async function load() {
  return import('@/lib/inventory/auto-86-service')
}

describe('reconcileAuto86', () => {
  it('hides a dish turned back on over an empty shelf (Egg at -1, no crossing)', async () => {
    const { client, writes } = clientWith({
      recipe_components: [line('r1', 'egg')],
      recipes: [base('r1', 'chicken')],
      inventory_items: [ingredient('egg', -1)],
      inventory_units: [PIECE],
      menu_items: [menuItem('chicken')],
    })
    const { reconcileAuto86 } = await load()

    const result = await reconcileAuto86(client, TENANT, ['egg'], NOW)

    expect(result).toEqual({ disabled: ['chicken'], reEnabled: [] })
    expect(writes).toHaveLength(1)
    expect(writes[0].patch).toEqual({ is_available: false, auto_disabled_at: NOW.toISOString() })
    expect(writes[0].filters).toEqual(
      expect.arrayContaining([['eq', 'tenant_id', TENANT], ['eq', 'is_available', true], ['in', 'id', ['chicken']]]),
    )
  })

  it('keeps a dish off when only its flour came back and its sugar (not moved) is still empty', async () => {
    const { client, writes } = clientWith({
      recipe_components: [line('r1', 'flour'), line('r1', 'sugar')],
      recipes: [base('r1', 'cake')],
      inventory_items: [ingredient('flour', 10), ingredient('sugar', 0)],
      inventory_units: [PIECE],
      menu_items: [menuItem('cake', { is_available: false, auto_disabled_at: '2026-11-02T00:00:00.000Z' })],
    })
    const { reconcileAuto86 } = await load()

    const result = await reconcileAuto86(client, TENANT, ['flour'], NOW)

    expect(result).toEqual({ disabled: [], reEnabled: [] })
    expect(writes).toHaveLength(0)
  })

  it('puts the dish back once every base ingredient can cover a serving', async () => {
    const { client, writes } = clientWith({
      recipe_components: [line('r1', 'flour'), line('r1', 'sugar')],
      recipes: [base('r1', 'cake')],
      inventory_items: [ingredient('flour', 10), ingredient('sugar', 3)],
      inventory_units: [PIECE],
      menu_items: [menuItem('cake', { is_available: false, auto_disabled_at: '2026-11-02T00:00:00.000Z' })],
    })
    const { reconcileAuto86 } = await load()

    const result = await reconcileAuto86(client, TENANT, ['sugar'], NOW)

    expect(result).toEqual({ disabled: [], reEnabled: ['cake'] })
    expect(writes[0].patch).toEqual({ is_available: true, auto_disabled_at: null })
    expect(writes[0].filters).toEqual(expect.arrayContaining([['not', 'auto_disabled_at', 'is:null']]))
  })

  it('never hides a dish over an ingredient nobody has counted yet (straws at -56)', async () => {
    const { client, writes } = clientWith({
      recipe_components: [line('r1', 'straw')],
      recipes: [base('r1', 'iced-latte')],
      inventory_items: [ingredient('straw', -56, null)],
      inventory_units: [PIECE],
      menu_items: [menuItem('iced-latte')],
    })
    const { reconcileAuto86 } = await load()

    expect(await reconcileAuto86(client, TENANT, ['straw'], NOW)).toEqual({ disabled: [], reEnabled: [] })
    expect(writes).toHaveLength(0)
  })

  it('does not read another tenant’s recipes or ingredients', async () => {
    const { client, writes } = clientWith({
      recipe_components: [{ ...line('r9', 'egg'), tenant_id: 'tenant-2' }],
      recipes: [{ ...base('r9', 'their-dish'), tenant_id: 'tenant-2' }],
      inventory_items: [{ ...ingredient('egg', 0), tenant_id: 'tenant-2' }],
      inventory_units: [PIECE],
      menu_items: [{ ...menuItem('their-dish'), tenant_id: 'tenant-2' }],
    })
    const { reconcileAuto86 } = await load()

    expect(await reconcileAuto86(client, TENANT, ['egg'], NOW)).toEqual({ disabled: [], reEnabled: [] })
    expect(writes).toHaveLength(0)
  })

  it('acts on nothing when a read fails — a partial picture must not hide dishes', async () => {
    const { client, writes } = clientWith(
      {
        recipe_components: [line('r1', 'egg')],
        recipes: [base('r1', 'chicken')],
        inventory_items: [ingredient('egg', 0)],
        inventory_units: [PIECE],
        menu_items: [menuItem('chicken')],
      },
      { inventory_items: 'boom' },
    )
    const { reconcileAuto86 } = await load()

    await expect(reconcileAuto86(client, TENANT, ['egg'], NOW)).rejects.toThrow(/inventory_items/)
    expect(writes).toHaveLength(0)
  })

  it('does nothing for an ingredient no base recipe uses', async () => {
    const { client, writes } = clientWith({
      recipe_components: [line('r-opt', 'pearls')],
      recipes: [{ ...base('r-opt', 'milk-tea'), target_type: 'modifier_option', modifier_option_id: 'o1' }],
      inventory_items: [ingredient('pearls', 0)],
      inventory_units: [PIECE],
      menu_items: [menuItem('milk-tea')],
    })
    const { reconcileAuto86 } = await load()

    expect(await reconcileAuto86(client, TENANT, ['pearls'], NOW)).toEqual({ disabled: [], reEnabled: [] })
    expect(writes).toHaveLength(0)
  })
})
