/**
 * Stock rules shared by the catalog mapper, the inventory webhook and the
 * live checkout check, so the three can never disagree about what "out of
 * stock" means.
 *
 * The bias is the same everywhere: only a POSITIVE report of zero (or less —
 * Loyverse permits negative levels when a sale outruns its receipt) counts as
 * empty. Unknown means sellable — a dish stuck invisible because Loyverse was
 * quiet is a worse failure than an occasional oversell.
 */

export interface StockLevel {
  variant_id: string
  store_id: string
  in_stock?: number | null
}

export interface VariantMapRow {
  kind: string
  menu_item_id: string | null
  loyverse_variant_id: string | null
}

/** `undefined` = no report for this variant. */
export function isSellableStock(level: number | undefined): boolean {
  return level === undefined || level > 0
}

/** Levels reported for one store, by variant. A missing `in_stock` reads as zero. */
export function levelsForStore(
  levels: readonly StockLevel[],
  storeId: string
): Map<string, number> {
  const byVariant = new Map<string, number>()
  for (const level of levels) {
    if (level.store_id === storeId) byVariant.set(level.variant_id, level.in_stock ?? 0)
  }
  return byVariant
}

/** menu_item_id → its mapped Loyverse variant ids (variant rows only). */
export function groupVariantsByMenuItem(rows: readonly VariantMapRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const row of rows) {
    if (row.kind !== 'variant' || !row.menu_item_id || !row.loyverse_variant_id) continue
    const list = grouped.get(row.menu_item_id)
    if (list) list.push(row.loyverse_variant_id)
    else grouped.set(row.menu_item_id, [row.loyverse_variant_id])
  }
  return grouped
}

/** A dish is sellable while ANY of its variants is. */
export function anyVariantSellable(
  variantIds: readonly string[],
  stockOf: (variantId: string) => number | undefined
): boolean {
  return variantIds.some((variantId) => isSellableStock(stockOf(variantId)))
}
