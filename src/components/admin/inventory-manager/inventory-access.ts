/**
 * What one account may see and do on the Inventory screen (plan §6, Phase 0d).
 *
 * Computed ONCE by the page from the caller and handed down, so no surface
 * re-derives it from a key name and two surfaces cannot disagree:
 *
 *  - `menu`      → the ingredient master (add / rename / archive, units) and recipes
 *  - `inventory` → recording stock, counts, transfers, reorder levels
 *  - `costs`     → every peso figure: unit cost, COGS, waste and shrinkage value
 *  - `reports`   → the takings (and so food cost %, which divides by them)
 *
 * A plain module, not a client file: the server page calls these functions, and
 * a helper exported from a 'use client' file throws when a Server Component
 * calls it.
 *
 * Hiding here is presentation only. The database refuses the writes on its own
 * (`inventory_items_client_guard`, the stock_movements policies); the point of
 * this file is that a clerk is never shown a control that will be refused, a
 * cost they may not see, or a page that crashes on a read it was never allowed.
 */

import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'

export interface InventoryAccess {
  /** Add, rename, archive ingredients; manage units; edit recipes. */
  canEditMaster: boolean
  /** Record deliveries, waste and counts. */
  canManageStock: boolean
  /** See (and type) unit costs, COGS, waste and shrinkage in pesos. */
  canSeeCosts: boolean
  /** See the day's takings and the food cost percentage. */
  canSeeSales: boolean
}

export const FULL_INVENTORY_ACCESS: InventoryAccess = {
  canEditMaster: true,
  canManageStock: true,
  canSeeCosts: true,
  canSeeSales: true,
}

const NO_INVENTORY_ACCESS: InventoryAccess = {
  canEditMaster: false,
  canManageStock: false,
  canSeeCosts: false,
  canSeeSales: false,
}

/**
 * `null` (no session, or the `app_users` read failed) grants nothing. The
 * admin layout already refuses such a caller; this only keeps the page from
 * reading `{ role: '' }` as NULL permissions, which `hasPermission` treats as
 * full access.
 */
export function resolveInventoryAccess(
  holder: PermissionHolder | null | undefined,
): InventoryAccess {
  if (!holder) return NO_INVENTORY_ACCESS
  return {
    canEditMaster: hasPermission(holder, 'menu'),
    canManageStock: hasPermission(holder, 'inventory'),
    canSeeCosts: hasPermission(holder, 'costs'),
    canSeeSales: hasPermission(holder, 'reports'),
  }
}

export interface InventoryReadPlan {
  /** `seedDefaultUnits` needs `menu` and THROWS without it; others read units plainly. */
  shouldSeedUnits: boolean
  /** The daily report is priced throughout, so it is not read without `costs`. */
  shouldReadDailyReport: boolean
  /** Takings are shown only beside the report, as sales and as food cost %. */
  shouldReadRevenue: boolean
}

export function planInventoryReads(access: InventoryAccess): InventoryReadPlan {
  return {
    shouldSeedUnits: access.canEditMaster,
    shouldReadDailyReport: access.canSeeCosts,
    shouldReadRevenue: access.canSeeCosts && access.canSeeSales,
  }
}
