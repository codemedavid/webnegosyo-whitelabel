/**
 * The generated database types must know an alert belongs to a branch.
 *
 * `stock_alerts.outlet_id` has existed in the database since the branch-scoped
 * alert migration, but `src/types/supabase.ts` was never regenerated, so the
 * column was invisible to TypeScript. Nothing broke, and that is the problem:
 * the insert in `stock-alerts-service.ts` casts its rows with `as never`, so a
 * row that forgot the branch — or spelled it `outletId` — would have compiled
 * and shipped, and the alert would have arrived attached to the whole store
 * rather than the shop that is actually short.
 *
 * **The RED here is compile-time, not runtime.** Jest transforms this file with
 * SWC, which strips types without checking them, so these assertions pass
 * whether or not the column is typed. The failure that matters is
 * `npx tsc --noEmit`, which is the command this file must be validated with.
 */

import type { Database } from '@/types/supabase'

type StockAlertRow = Database['public']['Tables']['stock_alerts']['Row']
type StockAlertInsert = Database['public']['Tables']['stock_alerts']['Insert']

describe('stock_alerts generated types', () => {
  it('carries the branch an alert was raised for', () => {
    const branchAlert: StockAlertInsert = {
      tenant_id: 'tenant-1',
      inventory_item_id: 'item-1',
      level: 'low',
      quantity: 2,
      outlet_id: 'outlet-north',
    }

    expect(branchAlert.outlet_id).toBe('outlet-north')
  })

  it('treats a store-wide alert as a null branch rather than a missing field', () => {
    // NULL is the unbranched store pool — a real location, not "unknown". A
    // non-nullable column here would force every single-shop tenant to invent
    // an outlet.
    const storeAlert: StockAlertInsert = {
      tenant_id: 'tenant-1',
      inventory_item_id: 'item-1',
      level: 'out',
      quantity: 0,
      outlet_id: null,
    }

    expect(storeAlert.outlet_id).toBeNull()
  })

  it('reads the branch back off a row', () => {
    const row: Pick<StockAlertRow, 'outlet_id'> = { outlet_id: 'outlet-south' }

    expect(row.outlet_id).toBe('outlet-south')
  })
})
