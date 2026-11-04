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
import { setDishAvailability, type DishAvailabilityResult } from '@/lib/inventory/dish-availability-service'
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

const dishAvailabilityInput = z.object({
  itemId: z.string().uuid(),
  tenantId: z.string().uuid(),
  tenantSlug: z.string().min(1).max(100),
  isAvailable: z.boolean(),
  sellAnyway: z.boolean(),
})

/**
 * The stock-aware toggle the menu list uses: turning on a dish whose counted
 * stock can't make one serving answers `needs_confirmation` (with the empty
 * ingredients) instead of saving, until the owner picks "Sell anyway until
 * end of day" (`sellAnyway: true`).
 */
export async function setDishAvailabilityAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  isAvailable: boolean,
  sellAnyway = false,
): Promise<{ success: true; data: DishAvailabilityResult } | { success: false; error: string }> {
  const parsed = dishAvailabilityInput.safeParse({ itemId, tenantId, tenantSlug, isAvailable, sellAnyway })
  if (!parsed.success) return { success: false, error: 'Invalid request' }
  try {
    const data = await setDishAvailability({
      tenantId: parsed.data.tenantId,
      menuItemId: parsed.data.itemId,
      isAvailable: parsed.data.isAvailable,
      sellAnyway: parsed.data.sellAnyway,
    })
    if (data.status === 'saved') {
      revalidatePath(`/${parsed.data.tenantSlug}/admin/menu`)
      revalidateStorefrontMenu(parsed.data.tenantSlug)
    }
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update availability' }
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
