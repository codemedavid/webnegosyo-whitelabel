/**
 * Does this store keep any stock the order pipeline could move?
 *
 * Most stores have inventory switched on but never add an ingredient. Their
 * every order still read the stock graph and wrote a "nothing to deduct" audit
 * row (8,841 rows from 35 such stores in the 30 days to 2026-11-16). A store
 * with no ingredient can have no recipe line (recipe components reference an
 * ingredient), so nothing could ever be deducted for it: the answer here lets
 * the pipeline stop before that work.
 *
 * Tracking = at least one ingredient (active or archived), or a simple option
 * counter that has ever moved. Fails toward "tracks": a failed read runs the
 * full path exactly as before. Only "tracks" is cached: a store that adds its
 * first ingredient is seen on its very next order.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

type Reader = Pick<SupabaseClient, 'from'>

const TRACKS_TTL_MS = 5 * 60 * 1000
const tracksUntil = new Map<string, number>()

async function hasAnyRow(db: Reader, table: 'inventory_items' | 'simple_option_stock_movements', tenantId: string): Promise<boolean> {
  const { data, error } = await db.from(table).select('id').eq('tenant_id', tenantId).limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

export async function storeTracksStock(db: Reader, tenantId: string, now: number = Date.now()): Promise<boolean> {
  if ((tracksUntil.get(tenantId) ?? 0) > now) return true
  try {
    const tracks = (await hasAnyRow(db, 'inventory_items', tenantId)) || (await hasAnyRow(db, 'simple_option_stock_movements', tenantId))
    if (tracks) tracksUntil.set(tenantId, now + TRACKS_TTL_MS)
    return tracks
  } catch {
    return true
  }
}

/** Tests only. */
export function resetStoreTracksStockCache(): void {
  tracksUntil.clear()
}
