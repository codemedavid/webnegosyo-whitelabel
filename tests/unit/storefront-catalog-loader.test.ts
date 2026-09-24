/**
 * `loadStorefrontCatalog` is the menu page's query plan, with the client
 * injected so the plan is testable without a database.
 */
import { loadStorefrontCatalog, type CatalogQueryClient } from '@/lib/storefront/storefront-catalog'
import type { Tenant } from '@/types/database'

interface TableResult { data: unknown; error: { message: string } | null }

/**
 * A PostgREST stand-in that honours `.range()` and `{ count: 'exact' }` the way
 * the server does, including the 1000-row `max-rows` cap on an unranged read.
 */
function createFakeClient(results: Record<string, TableResult>) {
  const queried: string[] = []
  const ranges: Record<string, Array<[number, number]>> = {}
  const orders: Record<string, string[]> = {}
  const client = {
    from: (table: string) => {
      queried.push(table)
      const result = results[table] ?? { data: [], error: null }
      let range: [number, number] | null = null
      let wantsCount = false
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      Object.assign(builder, {
        select: (_columns: string, options?: { count?: string }) => {
          wantsCount = options?.count === 'exact'
          return builder
        },
        eq: chain, in: chain,
        order: (column: string) => {
          orders[table] = [...(orders[table] ?? []), column]
          return builder
        },
        range: (from: number, to: number) => {
          range = [from, to]
          ranges[table] = [...(ranges[table] ?? []), range]
          return builder
        },
        then: (resolve: (value: unknown) => unknown) => {
          const rows = Array.isArray(result.data) ? result.data : null
          const [from, to] = range ?? [0, 999]
          const page = rows ? rows.slice(from, Math.min(to, from + 999) + 1) : result.data
          return Promise.resolve({
            data: result.error ? null : page,
            error: result.error,
            count: wantsCount && rows ? rows.length : null,
          }).then(resolve)
        },
      })
      return builder
    },
  } as unknown as CatalogQueryClient
  return { client, queried, ranges, orders }
}

const tenant = { id: 't-1', bundles_enabled: false, multi_branch_enabled: false } as unknown as Tenant

describe('loadStorefrontCatalog', () => {
  test('single-location tenant runs only the category and item queries', async () => {
    const { client, queried } = createFakeClient({
      categories: { data: [{ id: 'c1' }], error: null },
      menu_items: { data: [{ id: 'm1' }], error: null },
    })

    const catalog = await loadStorefrontCatalog(client, tenant)

    expect(queried.sort()).toEqual(['categories', 'menu_items'])
    expect(catalog).toMatchObject({ error: null, outletsFailed: false, overridesFailed: false, outlets: [], bundles: [] })
    expect(catalog.categories).toEqual([{ id: 'c1' }])
  })

  test('multi-branch tenant reads outlets and overrides too', async () => {
    const { client, queried } = createFakeClient({
      outlets: { data: [{ id: 'o1', is_active: true }], error: null },
    })

    const catalog = await loadStorefrontCatalog(client, { ...tenant, multi_branch_enabled: true })

    expect(queried).toEqual(expect.arrayContaining(['outlets', 'outlet_menu_items']))
    expect(catalog.outlets).toEqual([{ id: 'o1', is_active: true }])
  })

  test('a failed branch query is carried as a flag, not swallowed and not fatal', async () => {
    const { client } = createFakeClient({
      outlets: { data: null, error: { message: 'upstream request timeout' } },
    })

    const catalog = await loadStorefrontCatalog(client, { ...tenant, multi_branch_enabled: true })

    expect(catalog.error).toBeNull()
    expect(catalog.outletsFailed).toBe(true)
    expect(catalog.overridesFailed).toBe(false)
  })

  test('reads every dish past PostgREST\'s 1000-row cap', async () => {
    // Arrange — the 4066-item store that showed only its first 1000 dishes
    const items = Array.from({ length: 4066 }, (_, index) => ({ id: `m-${String(index).padStart(5, '0')}`, order: 0 }))
    const { client, ranges } = createFakeClient({ menu_items: { data: items, error: null } })

    // Act
    const catalog = await loadStorefrontCatalog(client, tenant)

    // Assert
    expect(catalog.error).toBeNull()
    expect(catalog.menuItems).toHaveLength(4066)
    expect(ranges.menu_items).toHaveLength(5)
  })

  test('orders the paged read totally, so ranges cannot skip or repeat dishes', async () => {
    const { client, orders } = createFakeClient({ menu_items: { data: [{ id: 'm1' }], error: null } })

    await loadStorefrontCatalog(client, tenant)

    expect(orders.menu_items).toEqual(['order', 'id'])
  })

  test('a failed category or item query is fatal', async () => {
    const { client } = createFakeClient({
      menu_items: { data: null, error: { message: 'canceling statement due to statement timeout' } },
    })

    const catalog = await loadStorefrontCatalog(client, tenant)

    expect(catalog.error).toContain('items: canceling statement')
    expect(catalog.menuItems).toEqual([])
  })
})
