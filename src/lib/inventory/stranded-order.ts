import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What the claim table knows about an order the platform no longer holds.
 *
 * A store that moved its orders from Convex to the platform (or back) leaves
 * its older orders on the old backend. Their stock claims and sale movements
 * stay in the platform ledger, so a void can still give the stock back from
 * them even though the order row is out of reach.
 */
export interface StrandedOrderClaim {
  hasClaim: boolean
  /** Branches the order's sale movements were booked to (null = store pool). */
  outletIds: Array<string | null>
}

/** A sale spends a handful of ingredients; this only bounds a pathological order. */
const MOVEMENT_SAMPLE_LIMIT = 200

/** Throws on a read error: "no claim" must never be guessed during an outage. */
export async function readStrandedOrderClaim(tenantId: string, orderId: string): Promise<StrandedOrderClaim> {
  const supabase = createAdminClient()
  const { data: claims, error } = await supabase
    .from('order_stock_applications')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .limit(1)
  if (error) throw error
  if (!claims || claims.length === 0) return { hasClaim: false, outletIds: [] }

  const { data: movements, error: movementError } = await supabase
    .from('stock_movements')
    .select('outlet_id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .limit(MOVEMENT_SAMPLE_LIMIT)
  if (movementError) throw movementError

  const outletIds = [...new Set((movements ?? []).map((row) => (row as { outlet_id: string | null }).outlet_id ?? null))]
  return { hasClaim: true, outletIds }
}
