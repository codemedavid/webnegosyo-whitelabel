/**
 * RLS refuses a delete with zero rows and no error. A branch-locked account with
 * `menu` used to get "success" here while the recipe kept deducting stock.
 */
import { deleteRecipeForTarget } from '@/lib/inventory/recipes-service'
import { deleteUnit } from '@/lib/inventory/units-service'

let deleted: unknown[] = []
let remaining: unknown[] = []

function chain(rows: () => unknown[]) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'limit']) query[method] = () => query
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(resolve)
  return query
}

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn(async () => undefined) }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      delete: () => chain(() => deleted),
      select: () => chain(() => remaining),
    }),
  }),
}))

const TARGET = { type: 'menu_item', menuItemId: 'item-1' } as never

describe('deleteRecipeForTarget', () => {
  beforeEach(() => {
    deleted = []
    remaining = []
  })

  test('succeeds when the recipe was removed', async () => {
    deleted = [{ id: 'recipe-1' }]

    await expect(deleteRecipeForTarget('tenant-1', TARGET)).resolves.toBeUndefined()
  })

  test('is a no-op when there was no recipe', async () => {
    await expect(deleteRecipeForTarget('tenant-1', TARGET)).resolves.toBeUndefined()
  })

  test('throws when RLS refused it and the recipe is still there', async () => {
    remaining = [{ id: 'recipe-1' }]

    await expect(deleteRecipeForTarget('tenant-1', TARGET)).rejects.toThrow(/store-wide/)
  })
})

describe('deleteUnit', () => {
  beforeEach(() => {
    deleted = []
  })

  test('throws when nothing was deleted', async () => {
    await expect(deleteUnit('unit-1', 'tenant-1')).rejects.toThrow(/store-wide/)
  })

  test('succeeds when the unit was removed', async () => {
    deleted = [{ id: 'unit-1' }]

    await expect(deleteUnit('unit-1', 'tenant-1')).resolves.toBeUndefined()
  })
})
