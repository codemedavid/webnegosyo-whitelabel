/**
 * `loadStorefrontCatalog` is the menu page's query plan, with the client
 * injected so the plan is testable without a database.
 */
import { loadStorefrontCatalog, type CatalogQueryClient } from '@/lib/storefront/storefront-catalog'
import type { Tenant } from '@/types/database'

interface TableResult { data: unknown; error: { message: string } | null }

function createFakeClient(results: Record<string, TableResult>) {
  const queried: string[] = []
  const client = {
    from: (table: string) => {
      queried.push(table)
      const result = results[table] ?? { data: [], error: null }
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      Object.assign(builder, {
        select: chain, eq: chain, in: chain, order: chain,
        then: (resolve: (value: TableResult) => unknown) => Promise.resolve(result).then(resolve),
      })
      return builder
    },
  } as unknown as CatalogQueryClient
  return { client, queried }
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

  test('a failed category or item query is fatal', async () => {
    const { client } = createFakeClient({
      menu_items: { data: null, error: { message: 'canceling statement due to statement timeout' } },
    })

    const catalog = await loadStorefrontCatalog(client, tenant)

    expect(catalog.error).toContain('items: canceling statement')
    expect(catalog.menuItems).toEqual([])
  })
})
