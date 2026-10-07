/** @jest-environment node */
/**
 * Confirming a photo import: checked as the person who tapped, categories
 * reused or created, each dish added once (at the end of its category), and
 * the storefront menu refreshed.
 */

import type { MenuImportPayload } from '@/lib/assistant/actions/kinds'

jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
const mockRevalidateMenu = jest.fn()
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: (...a: unknown[]) => mockRevalidateMenu(...a) }))

const mockVerify = jest.fn()
const mockCreateCategory = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...a: unknown[]) => mockVerify(...a),
  createCategory: (...a: unknown[]) => mockCreateCategory(...a),
  categorySchema: { safeParse: (value: unknown) => ({ success: true, data: value }), parse: (value: unknown) => value },
}))

let mockTables: Record<string, unknown[]> = {}
/** Pages of a paged read, by table; absent = mockTables as one page. */
let mockPages: Record<string, unknown[][]> = {}
let mockInsertError: { message: string } | null = null
const mockInserts: unknown[] = []
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: mockTables[table] ?? [], error: null }),
        range: async (from: number) => ({ data: mockPages[table]?.[from / 1000] ?? (from === 0 ? (mockTables[table] ?? []) : []), error: null }),
        insert: async (rows: unknown) => {
          mockInserts.push(rows)
          return { error: Array.isArray(rows) ? mockInsertError : null }
        },
      }
      return chain
    },
  }),
}))

const STORE = { id: 't', slug: 's' }
const PAYLOAD: MenuImportPayload = {
  categories: [{ name: 'Rice Meals', icon: null, isNew: false }, { name: 'Drinks', icon: '🥤', isNew: true }],
  items: [
    { name: 'Chicken Adobo', category: 'Rice Meals', price: 180 },
    { name: 'Sinigang', category: 'Rice Meals', price: 220 },
    { name: 'Iced Tea', category: 'Drinks', price: 45 },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockInserts.length = 0
  mockInsertError = null
  mockPages = {}
  // One read serves both the category list and the "next order" probe: order 7 is the top.
  mockTables = { categories: [{ id: 'cat-rice', name: 'rice meals' }], menu_items: [{ name: 'Sinigang', order: 7 }] }
  mockVerify.mockResolvedValue({})
  mockCreateCategory.mockResolvedValue({ id: 'cat-drinks' })
})

test('reuses the store’s category, creates the new one, skips a dish already on the menu, and appends the rest', async () => {
  const { executeMenuImport } = await import('@/lib/assistant/actions/execute-menu-import')

  const outcome = await executeMenuImport(STORE, PAYLOAD)

  expect(mockVerify).toHaveBeenCalledWith('t', 'menu')
  expect(mockCreateCategory).toHaveBeenCalledTimes(1)
  expect(mockCreateCategory.mock.calls[0][1]).toMatchObject({ name: 'Drinks', icon: '🥤' })
  const rows = mockInserts[0] as Array<{ name: string; category_id: string; order: number; tenant_id: string }>
  expect(rows.map((r) => [r.name, r.category_id, r.order, r.tenant_id])).toEqual([
    ['Chicken Adobo', 'cat-rice', 8, 't'],
    ['Iced Tea', 'cat-drinks', 8, 't'],
  ])
  expect(mockRevalidateMenu).toHaveBeenCalledWith('s')
  expect(outcome).toEqual({
    ok: true,
    message: 'Added 2 dishes to your menu with 1 new category. 1 was already on it.',
    resultRef: null,
    link: { label: 'Open menu to add photos', path: '/menu' },
  })
})

test('a refused batch is retried dish by dish instead of failing the whole import', async () => {
  mockInsertError = { message: 'boom' }
  const { executeMenuImport } = await import('@/lib/assistant/actions/execute-menu-import')

  const outcome = await executeMenuImport(STORE, PAYLOAD)

  // The batch, then each dish on its own (the single inserts succeed in this mock).
  expect(mockInserts).toHaveLength(3)
  expect(outcome).toMatchObject({ ok: true })
})

test('a dish beyond the first 1000 rows still counts as already on the menu', async () => {
  mockPages.menu_items = [Array.from({ length: 1000 }, (_, index) => ({ name: `Dish ${index}` })), PAYLOAD.items.map((item) => ({ name: item.name }))]
  const { executeMenuImport } = await import('@/lib/assistant/actions/execute-menu-import')

  const outcome = await executeMenuImport(STORE, PAYLOAD)

  expect(outcome).toEqual({ ok: false, error: 'All of these dishes are already on your menu, so nothing was added.' })
  expect(mockInserts).toHaveLength(0)
})

test('when every dish is already on the menu nothing is written', async () => {
  mockTables.menu_items = PAYLOAD.items.map((item) => ({ name: item.name.toUpperCase() }))
  const { executeMenuImport } = await import('@/lib/assistant/actions/execute-menu-import')

  const outcome = await executeMenuImport(STORE, PAYLOAD)

  expect(outcome).toEqual({ ok: false, error: 'All of these dishes are already on your menu, so nothing was added.' })
  expect(mockCreateCategory).not.toHaveBeenCalled()
  expect(mockInserts).toHaveLength(0)
})

test('a caller without the menu permission is stopped before any write', async () => {
  mockVerify.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
  const { executeMenuImport } = await import('@/lib/assistant/actions/execute-menu-import')

  await expect(executeMenuImport(STORE, PAYLOAD)).rejects.toThrow('Unauthorized')
  expect(mockInserts).toHaveLength(0)
})
