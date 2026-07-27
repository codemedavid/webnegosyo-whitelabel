/**
 * Reading open stock alerts back out for display.
 *
 * The write side (`stock-alerts-service.ts`) uses the service-role client
 * because it runs behind a customer's order, which has no admin session. This
 * read side deliberately does NOT: it runs for an admin looking at their own
 * inventory, so it goes through the RLS-enforcing server client like every
 * other admin read (`getStockMovements`).
 *
 * Ordering and wording live in `stock-alerts-view.ts` so the merchant app can
 * render the same list from the same rules.
 */

import { createClient } from '@/lib/supabase/server'
import {
  sortStockAlerts,
  type StockAlertLevel,
  type StockAlertView,
} from '@/lib/inventory/stock-alerts-view'

export type { StockAlertView }

interface StockAlertRow {
  id: string
  inventory_item_id: string
  level: string
  quantity: number
  reorder_level: number
  created_at: string
}

/**
 * Every unresolved alert for one tenant, worst first, resolved to ingredient
 * names and units.
 *
 * Returns an empty list rather than throwing: this renders inside the inventory
 * page, and a failed alert read must not take the page down with it.
 */
export async function getOpenStockAlerts(tenantId: string): Promise<StockAlertView[]> {
  try {
    const supabase = await createClient()

    const { data: alertRows, error } = await supabase
      .from('stock_alerts')
      .select('id, inventory_item_id, level, quantity, reorder_level, created_at')
      .eq('tenant_id', tenantId)
      .is('resolved_at', null)
    if (error) throw error

    const alerts = (alertRows ?? []) as unknown as StockAlertRow[]
    if (alerts.length === 0) return []

    const { data: itemRows } = await supabase
      .from('inventory_items')
      .select('id, name, stock_unit_id')
      .eq('tenant_id', tenantId)
      .in(
        'id',
        alerts.map((a) => a.inventory_item_id),
      )

    const items = (itemRows ?? []) as unknown as Array<{
      id: string
      name: string
      stock_unit_id: string
    }>
    const itemById = new Map(items.map((i) => [i.id, i]))

    const { data: unitRows } = await supabase
      .from('inventory_units')
      .select('id, abbreviation')
      .eq('tenant_id', tenantId)
      .in('id', [...new Set(items.map((i) => i.stock_unit_id))])

    const unitById = new Map(
      ((unitRows ?? []) as unknown as Array<{ id: string; abbreviation: string }>).map((u) => [
        u.id,
        u.abbreviation,
      ]),
    )

    const views: StockAlertView[] = []
    for (const alert of alerts) {
      const item = itemById.get(alert.inventory_item_id)
      // The FK cascades, so a dangling alert should be impossible — but one
      // must not render as a nameless row if it ever happens.
      if (!item) continue

      views.push({
        id: alert.id,
        inventoryItemId: alert.inventory_item_id,
        name: item.name,
        level: alert.level as StockAlertLevel,
        quantity: alert.quantity,
        reorderLevel: alert.reorder_level,
        // Losing the unit costs a suffix, not the whole alert.
        unitAbbreviation: unitById.get(item.stock_unit_id) ?? '',
        createdAt: alert.created_at,
      })
    }

    return sortStockAlerts(views)
  } catch (error) {
    console.error('[inventory] Failed to read open stock alerts', tenantId, error)
    return []
  }
}
