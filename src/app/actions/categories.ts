'use server'

import { revalidatePath } from 'next/cache'
import {
  getCategoriesByTenant,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  type CategoryInput,
} from '@/lib/admin-service'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'
import { invalidateCategoriesCache } from '@/lib/cache'

/**
 * Everything a category write must refresh: the Redis copy the admin pages read
 * (getCachedCategoriesByTenant), the admin route and the storefront menu.
 */
async function refreshCategoryCaches(tenantId: string, tenantSlug: string): Promise<void> {
  await invalidateCategoriesCache(tenantId)
  revalidatePath(`/${tenantSlug}/admin/categories`)
  revalidateStorefrontMenu(tenantSlug)
}

export async function getCategoriesAction(tenantId: string) {
  try {
    const categories = await getCategoriesByTenant(tenantId)
    return { success: true, data: categories }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch categories' }
  }
}

export async function createCategoryAction(tenantId: string, tenantSlug: string, input: CategoryInput) {
  try {
    const category = await createCategory(tenantId, input)
    await refreshCategoryCaches(tenantId, tenantSlug)
    return { success: true, data: category }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create category' }
  }
}

export async function updateCategoryAction(categoryId: string, tenantId: string, tenantSlug: string, input: CategoryInput) {
  try {
    const category = await updateCategory(categoryId, tenantId, input)
    await refreshCategoryCaches(tenantId, tenantSlug)
    return { success: true, data: category }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update category' }
  }
}

export async function deleteCategoryAction(categoryId: string, tenantId: string, tenantSlug: string) {
  try {
    await deleteCategory(categoryId, tenantId)
    await refreshCategoryCaches(tenantId, tenantSlug)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete category' }
  }
}

export async function reorderCategoriesAction(tenantId: string, tenantSlug: string, categoryIds: string[]) {
  try {
    await reorderCategories(tenantId, categoryIds)
    await refreshCategoryCaches(tenantId, tenantSlug)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reorder categories' }
  }
}

