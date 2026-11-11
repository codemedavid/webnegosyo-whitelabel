/**
 * @jest-environment node
 *
 * A stock count's coverage on a store with more than 1,000 ingredients.
 *
 * One response from the platform database carries at most 1,000 rows and says
 * nothing about the rest. Both reads behind a count's coverage stopped there:
 * the denominator (ingredients in scope when the count opened) and the
 * numerator (ingredients counted under it). A store with 1,200 ingredients
 * opened every count expecting 1,000, and a count that reached all 1,200 read
 * as 1,000 counted. Run against the fake tables, which cap like the platform.
 */
import { getCountProgress, openCount } from '@/lib/inventory/count-session-service'
import { fakeSupabaseTables } from '../fixtures/fake-supabase-tables'

const TENANT = 'tenant-1'
const COUNT = 'count-1'

type Fake = ReturnType<typeof fakeSupabaseTables>

let fake: Fake
let inserted: Record<string, unknown> | null

jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
      // The fake tables do not model INSERT; opening a count needs only to see the row it would write.
      from: (table: string) =>
        Object.assign(fake.client.from(table), {
          insert: (row: Record<string, unknown>) => {
            inserted = row
            return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id: COUNT, closed_at: null }, error: null }) }) }
          },
        }),
    }),
}))
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: () =>
    Promise.resolve({ user: { id: 'u-1' }, userRole: { role: 'admin', is_owner: true, permissions: null } }),
}))
jest.mock('@/lib/inventory/acting-branch-scope', () => ({
  resolveActingBranchScope: () => Promise.resolve({ kind: 'all' }),
}))

const pad = (index: number) => String(index).padStart(5, '0')

function ingredients(active: number, retired = 0) {
  return [
    ...Array.from({ length: active }, (_, index) => ({ id: `item-${pad(index)}`, tenant_id: TENANT, is_active: true })),
    ...Array.from({ length: retired }, (_, index) => ({ id: `retired-${pad(index)}`, tenant_id: TENANT, is_active: false })),
    { id: 'someone-elses', tenant_id: 'other-store', is_active: true },
  ]
}

/** One stocktake line per ingredient, filed under the count. */
function countedLines(items: number, recountsOfFirst = 0) {
  const line = (id: string, itemIndex: number) => ({
    id,
    tenant_id: TENANT,
    inventory_count_id: COUNT,
    inventory_item_id: `item-${pad(itemIndex)}`,
  })
  return [
    ...Array.from({ length: items }, (_, index) => line(`mv-${pad(index)}`, index)),
    ...Array.from({ length: recountsOfFirst }, (_, index) => line(`recount-${pad(index)}`, 0)),
    { id: 'mv-other-count', tenant_id: TENANT, inventory_count_id: 'another-count', inventory_item_id: 'item-99999' },
  ]
}

const closedCount = (expected: number) => ({
  id: COUNT,
  tenant_id: TENANT,
  outlet_id: null,
  business_day: '2026-11-10',
  status: 'closed',
  expected_item_count: expected,
  closed_at: '2026-11-10T09:00:00.000Z',
})

beforeEach(() => {
  inserted = null
})

describe('opening a count on a store with more than 1,000 ingredients', () => {
  it('expects every active ingredient, not the first 1,000', async () => {
    fake = fakeSupabaseTables({ inventory_items: ingredients(1200, 40), inventory_counts: [] })

    await openCount(TENANT, {})

    expect(inserted?.expected_item_count).toBe(1200)
  })

  it('still reads a small store in one request', async () => {
    fake = fakeSupabaseTables({ inventory_items: ingredients(37), inventory_counts: [] })

    await openCount(TENANT, {})

    expect(inserted?.expected_item_count).toBe(37)
    expect(fake.requests.filter((request) => request.table === 'inventory_items')).toHaveLength(1)
  })

  it('refuses to open with a wrong denominator when there are more ingredients than it will read', async () => {
    fake = fakeSupabaseTables({ inventory_items: ingredients(10_001), inventory_counts: [] })

    await expect(openCount(TENANT, {})).rejects.toThrow(/more than 10,000 ingredients/i)
    expect(inserted).toBeNull()
  })
})

describe('the progress of a count that reached more than 1,000 ingredients', () => {
  it('counts every ingredient reached, so a finished count reads as finished', async () => {
    fake = fakeSupabaseTables({ inventory_counts: [closedCount(1200)], stock_movements: countedLines(1200) })

    const progress = await getCountProgress(TENANT, COUNT)

    expect(progress?.countedCount).toBe(1200)
    expect(progress?.state).toBe('complete')
  })

  it('counts a recounted ingredient once, however many pages its lines fall on', async () => {
    fake = fakeSupabaseTables({ inventory_counts: [closedCount(1100)], stock_movements: countedLines(1100, 1500) })

    const progress = await getCountProgress(TENANT, COUNT)

    expect(progress?.countedCount).toBe(1100)
  })

  it('fails when a page cannot be read, rather than reporting the part it has', async () => {
    fake = fakeSupabaseTables({ inventory_counts: [closedCount(3)], stock_movements: countedLines(3) })
    const read = fake.client.from.bind(fake.client)
    fake.client.from = ((table: string) => {
      if (table !== 'stock_movements') return read(table)
      const failing: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'order', 'range']) failing[method] = () => failing
      failing.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: { message: 'statement timeout' } })
      return failing
    }) as typeof fake.client.from

    await expect(getCountProgress(TENANT, COUNT)).rejects.toMatchObject({ message: 'statement timeout' })
  })
})
