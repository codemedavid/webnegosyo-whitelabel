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
import { releasePresellForCancelledConvexOrder } from '@/lib/presell/convex-cancel'
import { MAX_RANGE_DAYS } from '@/lib/presell/month-grid'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

const dateKeySchema = z.string().regex(DATE_KEY, 'Date must be YYYY-MM-DD')

/**
 * One save for the whole panel: the dates now on offer, and the dates the
 * merchant dropped. Bounded by MAX_RANGE_DAYS on each side so a runaway
 * client cannot ask for an unbounded write.
 */
const syncAllocationsSchema = z.object({
  menuItemId: z.string().uuid('Must be a menu item id'),
  upserts: z
    .array(
      z.object({
        presellDate: dateKeySchema,
        stockQty: z.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative'),
      }),
    )
    .max(MAX_RANGE_DAYS, `No more than ${MAX_RANGE_DAYS} dates at once`),
  deletes: z.array(dateKeySchema).max(MAX_RANGE_DAYS, `No more than ${MAX_RANGE_DAYS} dates at once`),
})

interface ActionResult<T = undefined> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Turn anything thrown in here into a message the merchant can act on.
 *
 * PostgREST errors are plain objects, not `Error`s, so an `instanceof Error`
 * check alone reported every database refusal as the generic fallback — the
 * merchant was told "failed to save" while the real reason (a constraint, a
 * refused policy) never left the server.
 */
function fail(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues.map((issue) => issue.message).join('; ') }
  }
  if (error instanceof Error) return { success: false, error: error.message }
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return { success: false, error: (error as { message: string }).message }
  }
  return { success: false, error: fallback }
}

/**
 * Drop the storefront's cached menu so the new dates are on offer.
 *
 * Note what this costs, because it is not obvious and it is why this is now
 * called exactly once per save rather than once per click: revalidating ANY
 * path from a Server Action re-renders the route the caller is standing on.
 * Next sets `pathWasRevalidated` unconditionally (next/dist/server/web/
 * spec-extension/revalidate.js — its own TODO says "only revalidate if the
 * path matches"), and the action handler then ships a fresh RSC payload for
 * the current page while the client throws away its whole router cache.
 *
 * Naming only the storefront paths therefore does NOT spare the editor. The
 * edit page is re-rendered either way — six queries, including a full menu
 * scan — which is what merchants reported as "it keeps refreshing". The fix
 * is not a narrower path; it is calling this once, from the dish's own save,
 * after which the form navigates away anyway.
 */
function revalidateMenu(tenantSlug: string): void {
  revalidatePath(`/${tenantSlug}/menu`)
  revalidatePath(`/${tenantSlug}/menu/item/[itemId]`, 'page')
}

/**
 * Write the panel's whole draft in one go, when the dish is saved.
 *
 * This replaced four chatty actions — a save per date, a save per stepper
 * click, a delete, and a reload after each. Next runs server actions strictly
 * one after another and re-renders the current route after any revalidation,
 * so editing a week of dates meant a week of sequential round trips with the
 * editor re-rendering under the merchant between each: the "it keeps
 * refreshing" they reported. Nothing is written until "Update Menu Item".
 *
 * Refusals come first and refuse the WHOLE save. A partial apply would tell
 * the merchant it failed while half their dates had already landed.
 */
export async function syncPresellAllocationsAction(
  tenantId: string,
  tenantSlug: string,
  input: { menuItemId: string; upserts: { presellDate: string; stockQty: number }[]; deletes: string[] },
): Promise<ActionResult<PresellStock[]>> {
  try {
    await verifyTenantPermission(tenantId, 'menu')
    const parsed = syncAllocationsSchema.parse(input)
    if (parsed.upserts.length === 0 && parsed.deletes.length === 0) return { success: true, data: [] }

    const supabase = createAdminClient()

    if (parsed.deletes.length > 0) {
      const sold = await findSoldDates(supabase, tenantId, parsed.menuItemId, parsed.deletes)
      if (sold.length > 0) {
        return {
          success: false,
          error: `${formatDateList(sold)} already has orders. Set its stock to the sold count instead of removing it.`,
        }
      }
    }

    let saved: PresellStock[] = []
    if (parsed.upserts.length > 0) {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('presell_stock')
        .upsert(
          parsed.upserts.map((allocation) => ({
            tenant_id: tenantId,
            menu_item_id: parsed.menuItemId,
            presell_date: allocation.presellDate,
            stock_qty: allocation.stockQty,
            updated_at: now,
          })) as never,
          { onConflict: 'tenant_id,menu_item_id,presell_date' },
        )
        .select('*')
      if (error) throw error
      saved = (data ?? []) as PresellStock[]
    }

    for (const presellDate of parsed.deletes) {
      const { error } = await supabase
        .from('presell_stock')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('menu_item_id', parsed.menuItemId)
        .eq('presell_date', presellDate)
      if (error) throw error
    }

    revalidateMenu(tenantSlug)
    return { success: true, data: saved }
  } catch (error) {
    return fail(error, 'Failed to save the pre-order dates')
  }
}

/**
 * Which of these dates already have sales. Deleting one would erase the only
 * record of what was promised, so the save is refused and the merchant is
 * told to lower its stock instead.
 */
async function findSoldDates(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  menuItemId: string,
  presellDates: readonly string[],
): Promise<string[]> {
  const { data, error } = await supabase
    .from('presell_stock')
    .select('presell_date, sold_qty')
    .eq('tenant_id', tenantId)
    .eq('menu_item_id', menuItemId)
    .in('presell_date', presellDates as string[])
  if (error) throw error

  return ((data ?? []) as { presell_date: string; sold_qty: number }[])
    .filter((row) => Number(row.sold_qty) > 0)
    .map((row) => row.presell_date)
}

/** "20 Dec", or "20 Dec and 2 other dates" — readable without being a wall. */
function formatDateList(dates: readonly string[]): string {
  const [first, ...rest] = dates
  if (rest.length === 0) return first
  return `${first} and ${rest.length} other date${rest.length === 1 ? '' : 's'}`
}

/**
 * Give a cancelled Convex order's presell dates back.
 *
 * A Convex tenant's cancel never reaches `updateOrderStatus`, where the claim
 * is released for platform-backed orders — see lib/presell/convex-cancel.
 * Unauthenticated by design, exactly like `restoreOrderStockAction` beside it
 * in the same cancel handler: it can only ever return stock the order itself
 * claimed, and it is driven by the admin sheet that just cancelled it.
 */
export async function releasePresellForCancelledConvexOrderAction(
  tenantId: string,
  customerData: unknown,
) {
  try {
    await releasePresellForCancelledConvexOrder(tenantId, customerData)
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to release the pre-order stock for the cancelled order')
  }
}
