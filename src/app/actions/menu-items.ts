'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  getMenuItemsByTenant,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  type MenuItemInput,
} from '@/lib/admin-service'
import { reorderMenuItems } from '@/lib/menu-item-arrangement-service'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'

export async function getMenuItemsAction(tenantId: string) {
  try {
    const items = await getMenuItemsByTenant(tenantId)
    return { success: true, data: items }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch menu items' }
  }
}

export async function getMenuItemAction(itemId: string, tenantId: string) {
  try {
    const item = await getMenuItemById(itemId, tenantId)
    return { success: true, data: item }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch menu item' }
  }
}

export async function createMenuItemAction(tenantId: string, tenantSlug: string, input: MenuItemInput) {
  try {
    const item = await createMenuItem(tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidateStorefrontMenu(tenantSlug)
    return { success: true, data: item }
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: JSON.stringify(error.issues.map(err => ({
          path: err.path,
          message: err.message,
        })))
      }
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create menu item' }
  }
}

export async function updateMenuItemAction(itemId: string, tenantId: string, tenantSlug: string, input: MenuItemInput) {
  try {
    const item = await updateMenuItem(itemId, tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/admin/menu/${itemId}`)
    revalidateStorefrontMenu(tenantSlug)
    return { success: true, data: item }
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: JSON.stringify(error.issues.map(err => ({
          path: err.path,
          message: err.message,
        })))
      }
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update menu item' }
  }
}

export async function deleteMenuItemAction(itemId: string, tenantId: string, tenantSlug: string) {
  try {
    await deleteMenuItem(itemId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidateStorefrontMenu(tenantSlug)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete menu item' }
  }
}

export async function toggleAvailabilityAction(itemId: string, tenantId: string, tenantSlug: string, isAvailable: boolean) {
  try {
    const item = await toggleMenuItemAvailability(itemId, tenantId, isAvailable)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidateStorefrontMenu(tenantSlug)
    return { success: true, data: item }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle availability' }
  }
}


/** The most dishes one category arrangement may name — well past any real menu. */
const MAX_ARRANGED_ITEMS = 1000

const reorderMenuItemsInput = z.object({
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).max(MAX_ARRANGED_ITEMS),
})

/**
 * Arrange one category's dishes. The order is shared: the storefront and the
 * register both sort by it.
 */
export async function reorderMenuItemsAction(
  tenantId: string,
  tenantSlug: string,
  categoryId: string,
  itemIds: string[],
) {
  const parsed = reorderMenuItemsInput.safeParse({ tenantId, categoryId, itemIds })
  if (!parsed.success) return { success: false, error: 'That arrangement could not be read. Refresh and try again.' }

  try {
    await reorderMenuItems(parsed.data.tenantId, parsed.data.categoryId, parsed.data.itemIds)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidateStorefrontMenu(tenantSlug)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reorder dishes' }
  }
}
