'use server'

import { revalidatePath } from 'next/cache'
import {
  getMenuItemsByTenant,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  type MenuItemInput,
} from '@/lib/admin-service'

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
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data: item }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create menu item' }
  }
}

export async function updateMenuItemAction(itemId: string, tenantId: string, tenantSlug: string, input: MenuItemInput) {
  try {
    const item = await updateMenuItem(itemId, tenantId, input)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/admin/menu/${itemId}`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data: item }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update menu item' }
  }
}

export async function deleteMenuItemAction(itemId: string, tenantId: string, tenantSlug: string) {
  try {
    await deleteMenuItem(itemId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete menu item' }
  }
}

export async function toggleAvailabilityAction(itemId: string, tenantId: string, tenantSlug: string, isAvailable: boolean) {
  try {
    const item = await toggleMenuItemAvailability(itemId, tenantId, isAvailable)
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data: item }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle availability' }
  }
}

