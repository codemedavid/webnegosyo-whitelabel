/**
 * When each ingredient was last received.
 *
 * The inventory table shows a "Last Purchase" column, and the ledger already
 * knows the answer — a `receive` movement is a purchase arriving. Reading it
 * here keeps the table honest: the date shown is a movement that was actually
 * recorded, never a guess from `updated_at`.
 *
 * The reduction itself lives in `inventory-table.ts` and is tested there; this
 * file is only the read.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { toLastPurchaseMap, type ReceiveMovementRow } from '@/lib/inventory/inventory-table'

/**
 * A pantry's deliveries over its lifetime run to thousands of rows, and only
 * the newest per ingredient survives the reduction — so the read is capped and
 * ordered newest-first. A truncated tail can only cost an item its date, never
 * give one the wrong date.
 */
const MOVEMENT_READ_LIMIT = 2000

export async function getLastPurchaseDates(
  tenantId: string,
): Promise<Record<string, string>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('stock_movements')
    .select('inventory_item_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('reason', 'receive')
    .order('created_at', { ascending: false })
    .limit(MOVEMENT_READ_LIMIT)

  // A missing date is a blank cell; it must never cost the merchant the page.
  if (error) return {}

  return Object.fromEntries(toLastPurchaseMap((data ?? []) as ReceiveMovementRow[]))
}

/** Cached per request so a page reading it twice does not query twice. */
export const getCachedLastPurchaseDates = cache(getLastPurchaseDates)
