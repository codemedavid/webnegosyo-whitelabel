/**
 * Does this store seat guests at all? Dine-in has no tenant-level flag — it
 * is an order type of kind `dine_in` (order_types.type), so the answer is
 * "some enabled order type is that kind". The Tables tab hangs off this: a
 * pickup-only kiosk must never see a floor plan, and a restaurant gets it
 * without an app update.
 *
 * Pure predicate only — the supabase read and the hook live in
 * lib/use-dine-in.ts so this stays importable under the node test runner.
 * Matches the machine kind, never the merchant's label, which they rename
 * freely (see src/lib/outlets/mode-order-type.ts for the same rule).
 */

export const DINE_IN_ORDER_TYPE_KIND = "dine_in";

export interface OrderTypeKindRow {
  type?: string | null;
}

export function hasDineIn(rows: readonly OrderTypeKindRow[]): boolean {
  return rows.some((row) => row.type === DINE_IN_ORDER_TYPE_KIND);
}
