'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { createClient } from '@/lib/supabase/server'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'
import { insertLibraryGroupIntoDishes, type InsertGroupRequest } from '@/lib/addon-groups/insert-service'
import { duplicateCopyIds } from '@/lib/addon-groups/library-duplicates'
import type { ModifierGroupLibraryEntry } from '@/types/database'

/** Put one saved add-on group on many dishes. Needs the `menu` key. */
export async function insertAddonGroupIntoDishesAction(tenantId: string, tenantSlug: string, request: InsertGroupRequest) {
  try {
    await verifyTenantPermission(tenantId, 'menu')
    const supabase = await createClient()
    const result = await insertLibraryGroupIntoDishes(supabase, tenantId, request)
    if (result.added + result.replaced > 0) {
      revalidatePath(`/${tenantSlug}/admin/menu`)
      revalidateStorefrontMenu(tenantSlug)
    }
    return { success: true as const, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false as const, error: error.issues[0]?.message ?? 'Check the dishes you picked' }
    }
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to add the group to dishes' }
  }
}

/**
 * Delete identical copies of saved groups, keeping the oldest of each set
 * (`library-duplicates.ts`). Dishes already using a group are not affected:
 * a dish holds its own copy.
 */
export async function removeDuplicateAddonGroupsAction(tenantId: string, tenantSlug: string) {
  try {
    await verifyTenantPermission(tenantId, 'menu', 'delete')
    const supabase = await createClient()
    const { data, error } = await supabase.from('modifier_group_library').select('*').eq('tenant_id', tenantId)
    if (error) throw error

    const ids = duplicateCopyIds((data ?? []) as unknown as ModifierGroupLibraryEntry[])
    if (ids.length === 0) return { success: true as const, data: { removed: 0, removedIds: [] as string[] } }

    const { data: removed, error: deleteError } = await supabase
      .from('modifier_group_library')
      .delete()
      .eq('tenant_id', tenantId)
      .in('id', ids)
      .select('id')
    if (deleteError) throw deleteError

    // RLS refuses with zero rows, not an error: report what really went.
    const removedIds = (removed ?? []).map((row) => row.id as string)
    revalidatePath(`/${tenantSlug}/admin/addons`)
    return { success: true as const, data: { removed: removedIds.length, removedIds } }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to remove duplicates' }
  }
}
