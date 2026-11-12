/**
 * @jest-environment node
 *
 * Branch menus on a store with more than 1,000 branch differences.
 *
 * One response from the platform database carries at most 1,000 rows and says
 * nothing about the rest. The three list reads behind the admin's branch menu
 * screens stopped there, and a difference that is not read is the claim "this
 * branch sells it at the store-wide price": the screen showed a delisted dish
 * as listed and a branch price as the store's. Run against the fake tables,
 * which cap like the platform.
 */
import { createSupabaseOutletMenuRepository } from '@/lib/outlets/supabase-outlet-menu-repository'
import { fakeSupabaseTables } from '../fixtures/fake-supabase-tables'

const TENANT = 'tenant-1'
const OTHER_TENANT = 'tenant-2'

type Fake = ReturnType<typeof fakeSupabaseTables>

let fake: Fake

jest.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(fake.client) }))

const pad = (index: number) => String(index).padStart(5, '0')

function override(tenantId: string, outlet: number, item: number) {
  return {
    id: `row-${tenantId}-${pad(outlet)}-${pad(item)}`,
    tenant_id: tenantId,
    outlet_id: `outlet-${pad(outlet)}`,
    menu_item_id: `item-${pad(item)}`,
    is_listed: false,
    is_available: true,
    price: null,
    discounted_price: null,
    discount_cleared: false,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  }
}

/** `outlets` branches that each differ on `items` dishes, stored in no useful order. */
function overrides(outlets: number, items: number, tenantId = TENANT) {
  const rows = Array.from({ length: outlets * items }, (_, index) => override(tenantId, index % outlets, Math.floor(index / outlets)))
  return rows.reverse()
}

function seed(rows: ReturnType<typeof override>[], failures: Record<string, string> = {}) {
  fake = fakeSupabaseTables({ outlet_menu_items: [...rows, override(OTHER_TENANT, 0, 0)] }, failures)
}

const keysOf = (rows: { outlet_id: string; menu_item_id: string }[]) => rows.map((row) => `${row.outlet_id}/${row.menu_item_id}`)

const repository = () => createSupabaseOutletMenuRepository()

describe("every branch difference a store has (the admin's cross-branch menu)", () => {
  it('reads all of them past the first 1,000, each once', async () => {
    seed(overrides(5, 500))

    const rows = await repository().listByTenant(TENANT)

    expect(rows).toHaveLength(2500)
    expect(new Set(keysOf(rows)).size).toBe(2500)
    expect(rows.every((row) => row.tenant_id === TENANT)).toBe(true)
  })

  it('pages in a unique order (branch, then dish), so no row lands on two pages or on none', async () => {
    seed(overrides(5, 500))

    const rows = await repository().listByTenant(TENANT)

    expect(keysOf(rows)).toEqual([...keysOf(rows)].sort())
  })

  it('takes one request for a store under the cap and six for 5,000 rows', async () => {
    seed(overrides(3, 100))
    await repository().listByTenant(TENANT)
    expect(fake.requests).toHaveLength(1)

    seed(overrides(10, 500))
    await repository().listByTenant(TENANT)
    expect(fake.requests.map(({ from, to }) => [from, to])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
      [5000, 5999],
    ])
  })

  it('fails rather than answering with part of the rows past its ceiling', async () => {
    seed(overrides(41, 500))

    await expect(repository().listByTenant(TENANT)).rejects.toThrow(/more than 20,000/)
  })

  it('still throws on a failed read instead of reporting no differences', async () => {
    seed(overrides(2, 10), { outlet_menu_items: 'network' })

    await expect(repository().listByTenant(TENANT)).rejects.toThrow('network')
  })
})

describe("one branch's differences (its Menu tab)", () => {
  it('reads all of them past the first 1,000, in dish order', async () => {
    seed(overrides(2, 1200))

    const rows = await repository().listByOutlet(TENANT, 'outlet-00001')

    expect(rows).toHaveLength(1200)
    expect(rows.every((row) => row.outlet_id === 'outlet-00001')).toBe(true)
    expect(keysOf(rows)).toEqual([...keysOf(rows)].sort())
  })

  it('still throws on a failed read', async () => {
    seed(overrides(2, 10), { outlet_menu_items: 'network' })

    await expect(repository().listByOutlet(TENANT, 'outlet-00001')).rejects.toThrow('network')
  })
})

describe("one dish across every branch (the dish's Branches tab)", () => {
  it('reads all of them past the first 1,000, in branch order', async () => {
    seed(overrides(1001, 2))

    const rows = await repository().listByMenuItem(TENANT, 'item-00001')

    expect(rows).toHaveLength(1001)
    expect(rows.every((row) => row.menu_item_id === 'item-00001')).toBe(true)
    expect(keysOf(rows)).toEqual([...keysOf(rows)].sort())
  })

  it('still throws on a failed read', async () => {
    seed(overrides(2, 10), { outlet_menu_items: 'network' })

    await expect(repository().listByMenuItem(TENANT, 'item-00001')).rejects.toThrow('network')
  })
})
