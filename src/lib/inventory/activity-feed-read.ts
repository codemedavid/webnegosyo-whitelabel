/**
 * Reading the recent ledger for the activity feed.
 *
 * Runs for an admin looking at their own inventory, so it goes through the
 * RLS-enforcing server client like every other admin read — not the
 * service-role client the order-driven write path needs.
 *
 * Shaping lives in `activity-feed.ts`; this only fetches.
 */

import { createClient } from '@/lib/supabase/server'
import { buildActivityFeed, type ActivityFeedEntry } from '@/lib/inventory/activity-feed'
import type { InventoryItem, StockMovement } from '@/types/database'

/**
 * Enough rows to read as "what happened recently" without turning an unbounded
 * ledger into an unbounded query. One order can consume several rows, so this
 * is a ceiling on rows, not on events.
 */
const RECENT_MOVEMENT_LIMIT = 120

interface StaffRow {
  user_id: string
  display_name: string | null
  email: string | null
}

/**
 * The recent ledger for one tenant, newest first, grouped and named.
 *
 * Returns an empty feed rather than throwing: this renders inside the inventory
 * page, and a failed feed read must not take ingredients and recipes down with
 * it. The caller distinguishes the two — see `loadFailed`.
 */
export async function getInventoryActivity(
  tenantId: string,
  ingredients: readonly InventoryItem[],
): Promise<{ entries: ActivityFeedEntry[]; loadFailed: boolean }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('stock_movements')
      .select(
        'id, inventory_item_id, reason, quantity_delta, balance_after, order_id, created_at, created_by',
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(RECENT_MOVEMENT_LIMIT)

    // A PostgREST error arrives as `error`, not as a thrown exception, so
    // without this an unreadable ledger would render as a quiet, empty day.
    if (error) {
      console.error('[inventory] Activity feed read failed', tenantId, error)
      return { entries: [], loadFailed: true }
    }

    const nameById = new Map(ingredients.map((item) => [item.id, item.name]))

    // A roster that cannot be read costs the entries their names, not the
    // feed. Whoever moved the stock still moved it.
    const { data: staff } = await supabase
      .from('app_users')
      .select('user_id, display_name, email')
      .eq('tenant_id', tenantId)

    const actorById = new Map(
      ((staff ?? []) as unknown as StaffRow[]).map((row) => [
        row.user_id,
        // The email is a poor label but a true one; a blank name would render
        // as an entry that claims nobody entered it.
        row.display_name?.trim() || row.email || null,
      ]),
    )

    return {
      entries: buildActivityFeed((data ?? []) as unknown as StockMovement[], {
        ingredientName: (id) => nameById.get(id) ?? null,
        actorName: (id) => actorById.get(id) ?? null,
      }),
      loadFailed: false,
    }
  } catch (error) {
    console.error('[inventory] Failed to read inventory activity', tenantId, error)
    return { entries: [], loadFailed: true }
  }
}
