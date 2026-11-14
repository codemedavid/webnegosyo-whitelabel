/**
 * @jest-environment node
 *
 * The storefront's read of every branch-menu difference a store has.
 *
 * The menu page and the product page / cart re-check read ALL of a store's
 * overrides and pick the branch in the browser. One platform response carries
 * at most 1,000 rows and says nothing about the rest; a difference past that
 * read as "same as the store-wide menu", so a customer at a branch could be
 * shown (and charged) the store-wide price or offered a dish the branch took
 * off its board. Run against the fake tables, which cap like the platform.
 */
import { MAX_TENANT_OVERRIDE_ROWS, overrideReadProblem, readTenantOverrides } from '@/lib/outlets/read-tenant-overrides'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

const pad = (index: number) => String(index).padStart(5, '0')

function override(tenantId: string, outlet: number, item: number) {
  return {
    id: `row-${tenantId}-${pad(outlet)}-${pad(item)}`,
    tenant_id: tenantId,
    outlet_id: `outlet-${pad(outlet)}`,
    menu_item_id: `item-${pad(item)}`,
    is_listed: false,
    is_available: true,
    price: 99,
    discounted_price: null,
    discount_cleared: false,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  }
}

/** `outlets` branches that each differ on `items` dishes, stored in no useful order. */
function overrides(outlets: number, items: number, tenantId = 'tenant-1') {
  return Array.from({ length: outlets * items }, (_, index) => override(tenantId, index % outlets, Math.floor(index / outlets))).reverse()
}

const keysOf = (rows: { outlet_id: string; menu_item_id: string }[]) => rows.map((row) => `${row.outlet_id}/${row.menu_item_id}`)

describe('readTenantOverrides', () => {
  it('reads every difference past the first 1,000, each once, and only this store', async () => {
    const rows = overrides(3, 900)
    const fake = fakeSupabaseTables({ outlet_menu_items: [...rows, override('tenant-2', 0, 0)] })

    const result = await readTenantOverrides(fake.client as never, 'tenant-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2700)
    expect(new Set(keysOf(result.rows)).size).toBe(2700)
    expect(result.rows.every((row) => row.tenant_id === 'tenant-1')).toBe(true)
  })

  it('a failed page is a failed read, never part of the list', async () => {
    const fake = fakeSupabaseTables({ outlet_menu_items: overrides(2, 600) }, { outlet_menu_items: 'upstream request timeout' })

    const result = await readTenantOverrides(fake.client as never, 'tenant-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(overrideReadProblem(result)).toBe('upstream request timeout')
  })

  it('names the ceiling when a store has more differences than one read may take', () => {
    expect(overrideReadProblem({ ok: false, reason: 'too-many-rows', rows: [], maxRows: MAX_TENANT_OVERRIDE_ROWS })).toContain(
      String(MAX_TENANT_OVERRIDE_ROWS),
    )
  })
})
