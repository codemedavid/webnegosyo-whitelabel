'use server'

import { revalidatePath } from 'next/cache'
import {
  getCategoriesByTenant,
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryInput,
} from '@/lib/admin-service'

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
    revalidatePath(`/${tenantSlug}/admin/categories`)
    return { success: true, data: category }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create category' }
  }
}

export async function updateCategoryAction(categoryId: string, tenantId: string, tenantSlug: string, input: CategoryInput) {
  try {
    const category = await updateCategory(categoryId, tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/categories`)
    return { success: true, data: category }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update category' }
  }
}

export async function deleteCategoryAction(categoryId: string, tenantId: string, tenantSlug: string) {
  try {
    await deleteCategory(categoryId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/categories`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete category' }
  }
}

