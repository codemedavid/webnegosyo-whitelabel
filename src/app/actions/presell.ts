'use server'

/**
 * Admin writes to per-date presell allocations (migration 20260830120000).
 *
 * These touch only `stock_qty` — the offer. `sold_qty` is the record of sales
 * and moves exclusively through apply_presell_order(); no admin surface may
 * edit it, or "remaining" stops meaning anything. Lowering stock below what
 * already sold is allowed and simply clamps remaining to zero.
 *
 * Guarded like every menu write: verifyTenantPermission(tenantId, 'menu').
 * The write itself uses the service-role client for the same reason the
 * inventory services do — the guard has already proven the caller, and RLS
 * policies on presell_stock exist for defense in depth, not as the boundary.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PresellStock } from '@/types/database'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

const allocationSchema = z.object({
  menuItemId: z.string().uuid('Must be a menu item id'),
  presellDate: z.string().regex(DATE_KEY, 'Date must be YYYY-MM-DD'),
  stockQty: z.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative'),
})

interface ActionResult<T = undefined> {
  success: boolean
  data?: T
  error?: string
}

function fail(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues.map((issue) => issue.message).join('; ') }
  }
  return { success: false, error: error instanceof Error ? error.message : fallback }
}

function revalidateMenu(tenantSlug: string, menuItemId: string): void {
  revalidatePath(`/${tenantSlug}/admin/menu/${menuItemId}`)
  revalidatePath(`/${tenantSlug}/menu`)
  revalidatePath(`/${tenantSlug}/menu/item/[itemId]`, 'page')
}

/** Every allocation for one item, soonest date first — sold counts included so the panel can show remaining. */
export async function getPresellStockAction(
  tenantId: string,
  menuItemId: string,
): Promise<ActionResult<PresellStock[]>> {
  try {
    await verifyTenantPermission(tenantId, 'menu')

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('presell_stock')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('menu_item_id', menuItemId)
      .order('presell_date', { ascending: true })
    if (error) throw error

    return { success: true, data: (data ?? []) as PresellStock[] }
  } catch (error) {
    return fail(error, 'Failed to load presell dates')
  }
}

/** Create or change one date's allocation. Upsert on (tenant, item, date). */
export async function savePresellAllocationAction(
  tenantId: string,
  tenantSlug: string,
  input: { menuItemId: string; presellDate: string; stockQty: number },
): Promise<ActionResult<PresellStock>> {
  try {
    await verifyTenantPermission(tenantId, 'menu')
    const parsed = allocationSchema.parse(input)

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('presell_stock')
      .upsert(
        {
          tenant_id: tenantId,
          menu_item_id: parsed.menuItemId,
          presell_date: parsed.presellDate,
          stock_qty: parsed.stockQty,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'tenant_id,menu_item_id,presell_date' },
      )
      .select('*')
      .single()
    if (error) throw error

    revalidateMenu(tenantSlug, parsed.menuItemId)
    return { success: true, data: data as PresellStock }
  } catch (error) {
    return fail(error, 'Failed to save presell date')
  }
}

/**
 * Remove a date's allocation entirely. Refused while the date has sales —
 * deleting the row would erase the only record of how many were promised;
 * setting stock to the sold count is the way to stop selling more.
 */
export async function deletePresellAllocationAction(
  tenantId: string,
  tenantSlug: string,
  input: { menuItemId: string; presellDate: string },
): Promise<ActionResult> {
  try {
    await verifyTenantPermission(tenantId, 'menu')
    const parsed = allocationSchema.omit({ stockQty: true }).parse(input)

    const supabase = createAdminClient()
    const { data: existing, error: readError } = await supabase
      .from('presell_stock')
      .select('sold_qty')
      .eq('tenant_id', tenantId)
      .eq('menu_item_id', parsed.menuItemId)
      .eq('presell_date', parsed.presellDate)
      .maybeSingle()
    if (readError) throw readError

    if (existing && Number((existing as { sold_qty: number }).sold_qty) > 0) {
      return {
        success: false,
        error: 'This date already has orders. Set its stock to the sold count to stop selling more.',
      }
    }

    const { error } = await supabase
      .from('presell_stock')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('menu_item_id', parsed.menuItemId)
      .eq('presell_date', parsed.presellDate)
    if (error) throw error

    revalidateMenu(tenantSlug, parsed.menuItemId)
    return { success: true }
  } catch (error) {
    return fail(error, 'Failed to remove presell date')
  }
}
