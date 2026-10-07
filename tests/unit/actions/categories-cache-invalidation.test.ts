/**
 * Every admin menu page reads categories through a Redis copy
 * (getCachedCategoriesByTenant). A category write that only revalidated Next
 * paths left that copy serving the old list until its TTL ran out.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const invalidateCategoriesCache = jest.fn(async (tenantId: string) => { void tenantId })

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: jest.fn() }))
jest.mock('@/lib/cache', () => ({
  invalidateCategoriesCache: (tenantId: string) => invalidateCategoriesCache(tenantId),
}))
jest.mock('@/lib/admin-service', () => ({
  getCategoriesByTenant: async () => [],
  createCategory: async () => ({ id: 'cat-1' }),
  updateCategory: async () => ({ id: 'cat-1' }),
  deleteCategory: async () => undefined,
  reorderCategories: async () => undefined,
}))

describe('category actions refresh the cached category list', () => {
  beforeEach(() => {
    invalidateCategoriesCache.mockClear()
  })

  test.each([
    ['create', async (a: typeof import('@/app/actions/categories')) => a.createCategoryAction('tenant-1', 'shop', { name: 'Drinks' } as never)],
    ['update', async (a: typeof import('@/app/actions/categories')) => a.updateCategoryAction('cat-1', 'tenant-1', 'shop', { name: 'Drinks' } as never)],
    ['delete', async (a: typeof import('@/app/actions/categories')) => a.deleteCategoryAction('cat-1', 'tenant-1', 'shop')],
    ['reorder', async (a: typeof import('@/app/actions/categories')) => a.reorderCategoriesAction('tenant-1', 'shop', ['cat-1'])],
  ])('%s drops the tenant categories cache', async (_name, run) => {
    // Arrange
    const actions = await import('@/app/actions/categories')

    // Act
    const result = await run(actions)

    // Assert
    expect(result.success).toBe(true)
    expect(invalidateCategoriesCache).toHaveBeenCalledWith('tenant-1')
  })
})
