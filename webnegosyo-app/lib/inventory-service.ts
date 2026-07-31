/**
 * Reading the ingredient shelf for the merchant app.
 *
 * Inventory lives in the platform Supabase for every tenant regardless of where
 * their orders live (see lib/pos-stock.ts for the same reasoning on the write
 * side), so this is a plain Supabase read rather than a Convex query. The app's
 * client carries the merchant's own session and `inventory_items` RLS is scoped
 * to their tenant — no service role is involved here, unlike the server-side
 * alert writer, which runs behind a customer order with no admin session.
 *
 * Shaping lives in lib/inventory-stock.ts; this file only fetches.
 */

import { supabase } from "./supabase";
import {
  applyBranchStock,
  buildStockViews,
  sortStockViews,
  type BranchStockRow,
  type InventoryItemRow,
  type InventoryUnitRow,
  type StockItemView,
} from "./inventory-stock";

const ITEM_COLUMNS = "id, name, current_qty, reorder_level, is_active, stock_unit_id";
const STOCK_COLUMNS = "inventory_item_id, outlet_id, current_qty, reorder_level";

/**
 * The tenant's shelf, worst first.
 *
 * Ordering is settled here rather than on the screen so the list a merchant
 * pulls to refresh is the list they were already reading; the screen filters
 * but never re-sorts.
 *
 * `outletId` narrows the quantities to one branch's shelf. Omit it — a
 * single-shop tenant, or an owner looking at the whole store — and the branch
 * table is never queried at all, so nothing changes for the tenants who have no
 * branches. See `applyBranchStock` for why absent means zero.
 */
export async function loadInventoryStock(
  tenantId: string,
  outletId?: string | null,
): Promise<StockItemView[]> {
  // The auth store starts empty — a cold mount must not query for every tenant.
  if (!tenantId) return [];

  const [itemsResult, unitsResult, stockResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(ITEM_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
    supabase.from("inventory_units").select("id, abbreviation").eq("tenant_id", tenantId),
    outletId === undefined
      ? Promise.resolve(null)
      : supabase.from("inventory_stock").select(STOCK_COLUMNS).eq("tenant_id", tenantId),
  ]);

  if (itemsResult.error) throw itemsResult.error;

  // A unit catalog that cannot be read costs the suffix, not the shelf.
  const units = (unitsResult.error ? [] : unitsResult.data ?? []) as unknown as InventoryUnitRow[];
  const items = (itemsResult.data ?? []) as unknown as InventoryItemRow[];

  // A failed branch read leaves every row at zero rather than falling back to
  // the roll-up. Showing a manager the chain's flour labelled as their own is
  // the failure this whole path exists to prevent, and it is worse than showing
  // an empty shelf: one is wrong quietly, the other is obviously wrong.
  const stock = (stockResult?.error ? [] : stockResult?.data ?? []) as unknown as BranchStockRow[];

  return sortStockViews(buildStockViews(applyBranchStock(items, stock, outletId), units));
}
