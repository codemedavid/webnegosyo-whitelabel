/**
 * The menu management list used to read `*, category:categories(*)` — every
 * dish's variations, add-ons and modifier groups JSON, plus a copy of its
 * category — and serialize all of it to the browser, which renders a name, a
 * photo, a price and a few badges. The lean read names exactly the columns the
 * list touches; these tests pin that projection and the storefront ordering.
 */

interface Call {
  table?: string
  select?: string
  eq?: [string, unknown]
  orders: Array<[string, unknown]>
}

function fakeClient(result: { data: unknown; error: unknown }) {
  const call: Call = { orders: [] }
  const chain = {
    select(projection: string) {
      call.select = projection
      return chain
    },
    eq(column: string, value: unknown) {
      call.eq = [column, value]
      return chain
    },
    order(column: string, options: unknown) {
      call.orders.push([column, options])
      return chain
    },
    // The PromiseLike signature exactly, so the fake satisfies the query type.
    then<T1 = typeof result, T2 = never>(
      onfulfilled?: ((value: typeof result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(result).then(onfulfilled, onrejected)
    },
  }
  return {
    call,
    client: {
      from(table: string) {
        call.table = table
        return chain
      },
    },
  }
}

// Lazy import: next/jest's SWC transform does not hoist jest.mock above static
// imports, so the module under test is loaded inside each test.
async function load() {
  return import('@/lib/queries/admin-menu-list')
}

describe('listAdminMenuItems', () => {
  test('reads only the list columns — no JSONB and no embedded category', async () => {
    // Arrange
    const { listAdminMenuItems, ADMIN_MENU_LIST_COLUMNS } = await load()
    const { client, call } = fakeClient({ data: [], error: null })

    // Act
    await listAdminMenuItems(client, 't1')

    // Assert
    expect(call.table).toBe('menu_items')
    const projected = (call.select ?? '').split(',').map((column) => column.trim())
    expect(projected).toEqual([...ADMIN_MENU_LIST_COLUMNS])
    for (const heavy of ['*', 'variations', 'variation_types', 'addons', 'modifier_groups']) {
      expect(projected).not.toContain(heavy)
    }
    // No embedded category copy (`category:categories(*)`).
    expect(call.select).not.toMatch(/categories\(|\*/)
    expect(call.eq).toEqual(['tenant_id', 't1'])
  })

  test('includes every field the list, its badges and branch summary read', async () => {
    const { ADMIN_MENU_LIST_COLUMNS } = await load()

    // Row, filters, grouping, arrange list, branch summary and the auto-86 badge.
    const consumed = [
      'id', 'category_id', 'name', 'description', 'price', 'discounted_price', 'image_url',
      'is_available', 'auto_disabled_at', 'is_featured', 'presell_enabled', 'order',
    ]

    expect(ADMIN_MENU_LIST_COLUMNS).toEqual(expect.arrayContaining(consumed))
  })

  test('orders like the storefront: position, then id to break ties', async () => {
    const { listAdminMenuItems } = await load()
    const { client, call } = fakeClient({ data: [], error: null })

    await listAdminMenuItems(client, 't1')

    expect(call.orders).toEqual([
      ['order', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })

  test('returns the rows as read', async () => {
    const { listAdminMenuItems } = await load()
    const rows = [{ id: 'a', name: 'Adobo' }]
    const { client } = fakeClient({ data: rows, error: null })

    await expect(listAdminMenuItems(client, 't1')).resolves.toEqual(rows)
  })

  test('throws the database error instead of rendering an empty menu', async () => {
    const { listAdminMenuItems } = await load()
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })

    await expect(listAdminMenuItems(client, 't1')).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('listMenuItemPriceRefs', () => {
  test('reads only id, name and the two prices, in menu order', async () => {
    // Arrange
    const { listMenuItemPriceRefs } = await load()
    const { client, call } = fakeClient({ data: [], error: null })

    // Act
    await listMenuItemPriceRefs(client, 't1')

    // Assert
    expect(call.select).toBe('id, name, price, discounted_price')
    expect(call.eq).toEqual(['tenant_id', 't1'])
    expect(call.orders).toEqual([
      ['order', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })

  test('normalises a missing sale price to null', async () => {
    const { listMenuItemPriceRefs } = await load()
    const { client } = fakeClient({ data: [{ id: 'a', name: 'Rice', price: 20 }], error: null })

    await expect(listMenuItemPriceRefs(client, 't1')).resolves.toEqual([
      { id: 'a', name: 'Rice', price: 20, discounted_price: null },
    ])
  })

  test('throws the database error', async () => {
    const { listMenuItemPriceRefs } = await load()
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })

    await expect(listMenuItemPriceRefs(client, 't1')).rejects.toMatchObject({ message: 'boom' })
  })
})

// A module, not a global script: its `load` helper must not collide with other tests'.
export {}
