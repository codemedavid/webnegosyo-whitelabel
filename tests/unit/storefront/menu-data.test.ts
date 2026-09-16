import { getMenuData } from '@/app/[tenant]/menu/menu-server'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

type Row = Record<string, unknown>
type QueryError = { message: string; code?: string }
type Query = { table: string; filters: Array<[string, unknown]>; categories?: string[] }

function database(
  tables: Record<string, Row[]> = {},
  failures: Record<string, QueryError> = {},
) {
  const queries: Query[] = []
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from(table: string) {
      const query: Query = { table, filters: [] }
      queries.push(query)
      let order: string | undefined
      const result = () => {
        const failureKey = table === 'menu_items' && query.categories ? 'slot_items' : table
        if (failures[failureKey]) return { data: null, error: failures[failureKey] }
        const data = (tables[table] ?? []).filter((row) =>
          query.filters.every(([key, value]) => row[key] === value) &&
          (!query.categories || query.categories.includes(row.category_id as string)),
        )
        if (order) data.sort((a, b) => Number(a[order!]) - Number(b[order!]))
        return { data, error: null }
      }
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder },
        in: (_key: string, values: string[]) => { query.categories = values; return builder },
        order: (key: string) => { order = key; return builder },
        maybeSingle: async () => { const response = result(); return { ...response, data: response.data?.[0] ?? null } },
        then: (resolve: (value: ReturnType<typeof result>) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      }
      return builder
    },
  }
  jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return { queries }
}

const tenant = { id: 'tenant-1', slug: 'cafe', is_active: true, bundles_enabled: false }
const dish = (id: string, category_id: string, order: number, extra: Row = {}) =>
  ({ id, category_id, order, tenant_id: tenant.id, is_available: true, ...extra })
const bundle = (id: string, slots: Row[]) =>
  ({ id, slots, tenant_id: tenant.id, is_active: true, show_on_menu: true, display_order: 1 })

const bundleTables = {
  tenants: [{ ...tenant, bundles_enabled: true }],
  bundles: [
    bundle('lunch', [
      { id: 'main', category_id: 'mains', included_item_ids: [] },
      { id: 'drink', category_id: 'drinks', included_item_ids: ['tea'] },
    ]),
    bundle('dinner', [
      { id: 'limited', category_id: 'mains', included_item_ids: ['rice', 'soup', 'sold-out', 'other-tenant'] },
      { id: 'all-drinks', category_id: 'drinks', included_item_ids: null },
    ]),
  ],
  menu_items: [
    dish('rice', 'mains', 3), dish('soup', 'mains', 1), dish('tea', 'drinks', 2),
    dish('juice', 'drinks', 0), dish('sold-out', 'mains', 0, { is_available: false }),
    dish('other-tenant', 'mains', 0, { tenant_id: 'tenant-2' }),
    dish('dessert', 'desserts', 0),
  ],
}

describe('storefront menu data', () => {
  beforeEach(() => jest.clearAllMocks())

  it('distinguishes an absent restaurant from a tenant read outage', async () => {
    database()
    const absent = await getMenuData('cafe')
    expect(absent).toMatchObject({ status: 'not-found', tenant: null, error: 'Restaurant not found' })

    database({}, { tenants: { message: 'Database timed out' } })
    const outage = await getMenuData('cafe')
    expect(outage).toMatchObject({ status: 'error', tenant: null })
    expect(outage.error).toContain('Database timed out')
  })

  it('carries branch failure flags even when a primary menu read also fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    database({ tenants: [{ ...tenant, multi_branch_enabled: true }] }, {
      categories: { message: 'Categories timed out' },
      outlets: { message: 'Outlets timed out' },
      outlet_menu_items: { message: 'Branch prices timed out' },
    })

    const result = await getMenuData('cafe')

    expect(result).toMatchObject({ status: 'error', tenant, outletsFailed: true, overridesFailed: true })
    expect(result.error).toContain('Categories timed out')
    warn.mockRestore()
  })

  it('fills multiple bundles with one scoped slot read, retaining category restrictions and dish order', async () => {
    const { queries } = database(bundleTables)

    const result = await getMenuData('cafe')

    expect(result.status).toBe('ready')
    const slotQueries = queries.filter((query) => query.table === 'menu_items' && query.categories)
    expect(slotQueries).toEqual([{
      table: 'menu_items',
      categories: ['mains', 'drinks'],
      filters: [['tenant_id', tenant.id], ['is_available', true]],
    }])
    expect(result.bundles.map((entry) => entry.slots.map((slot) => slot.items?.map((item) => item.id))))
      .toEqual([[['soup', 'rice'], ['tea']], [['soup', 'rice'], ['juice', 'tea']]])
    expect(result.menuItems.map((item) => item.id)).toContain('sold-out')
    expect(result.menuItems.map((item) => item.id)).not.toContain('other-tenant')
  })

  it.each(['bundles', 'slot_items'])('keeps the menu usable when %s cannot be read', async (failure) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    database(bundleTables, { [failure]: { message: 'Read timed out' } })

    const result = await getMenuData('cafe')

    expect(result.status).toBe('ready')
    expect(result.error).toBeNull()
    expect(result.menuItems.length).toBeGreaterThan(0)
    expect(result.bundles.flatMap((entry) => entry.slots.flatMap((slot) => slot.items ?? []))).toEqual([])
    warn.mockRestore()
  })

  it('carries branch failures without hiding successfully loaded menu items', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    database({ ...bundleTables, tenants: [{ ...tenant, multi_branch_enabled: true }] }, {
      outlets: { message: 'Outlets timed out' },
      outlet_menu_items: { message: 'Branch prices timed out' },
    })
    const result = await getMenuData('cafe')

    expect(result).toMatchObject({ status: 'ready', outletsFailed: true, overridesFailed: true })
    expect(result.menuItems.length).toBeGreaterThan(0)
    warn.mockRestore()
  })
})
