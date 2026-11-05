/**
 * The stock-aware hand toggle: turn a dish on or off, and when turning on a
 * dish its counted stock can't make, ask first (`dish-availability.ts`).
 *
 * The write goes through the CALLER's session client (RLS + the menu
 * permission), exactly like the plain toggle; only the stock reads use the
 * service role, after the permission check, because recipes and costs are
 * not every caller's to read and the question needs only names and counts.
 *
 * Reading the stock can fail; the toggle must not. A failed read is logged and
 * the dish is turned on without the question — the checkout guard and auto-86
 * still judge it on the next order.
 */

import { verifyTenantPermission } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  decideDishAvailabilityWrite,
  readDishStockBlockers,
  sellAnywayUntil,
  type DishStockBlocker,
} from '@/lib/inventory/dish-availability'

export type DishAvailabilityResult =
  | { status: 'saved'; isAvailable: boolean; snoozedUntil: string | null }
  | { status: 'needs_confirmation'; blockers: DishStockBlocker[]; sellAnywayUntil: string }

export interface DishAvailabilityRequest {
  tenantId: string
  menuItemId: string
  isAvailable: boolean
  /** The owner answered "Sell anyway until end of day". */
  sellAnyway?: boolean
}

async function readStockQuestion(
  tenantId: string,
  menuItemId: string,
): Promise<{ blockers: DishStockBlocker[]; until: string }> {
  const admin = createAdminClient()
  try {
    const { data: tenant, error } = await admin
      .from('tenants')
      .select('inventory_enabled')
      .eq('id', tenantId)
      .maybeSingle()
    if (error) throw error
    if ((tenant as { inventory_enabled?: boolean | null } | null)?.inventory_enabled !== true) {
      return { blockers: [], until: '' }
    }
    const [blockers, until] = await Promise.all([
      readDishStockBlockers(admin, tenantId, menuItemId),
      sellAnywayUntil(admin, tenantId),
    ])
    return { blockers, until }
  } catch (error) {
    console.error('[inventory] Dish stock check failed; toggling without it', tenantId, menuItemId, error)
    return { blockers: [], until: '' }
  }
}

export async function setDishAvailability(request: DishAvailabilityRequest): Promise<DishAvailabilityResult> {
  const { tenantId, menuItemId, isAvailable } = request
  await verifyTenantPermission(tenantId, 'menu')

  const question = isAvailable ? await readStockQuestion(tenantId, menuItemId) : { blockers: [], until: '' }
  const decision = decideDishAvailabilityWrite({
    isAvailable,
    sellAnyway: request.sellAnyway === true,
    blockers: question.blockers,
    sellAnywayUntil: question.until,
  })
  if (decision.kind === 'confirm') {
    return { status: 'needs_confirmation', blockers: decision.blockers, sellAnywayUntil: decision.sellAnywayUntil }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('menu_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag auto_86_snoozed_until
    .update(decision.patch as any)
    .eq('id', menuItemId)
    .eq('tenant_id', tenantId)
    .select('id')
  if (error) throw error
  // RLS refusals are silent: zero rows is a refusal, not a success.
  if (!data || data.length === 0) throw new Error('That dish could not be updated.')

  return { status: 'saved', isAvailable, snoozedUntil: decision.patch.auto_86_snoozed_until }
}
