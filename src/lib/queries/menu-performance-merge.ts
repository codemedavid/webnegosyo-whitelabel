/**
 * Pure per-item sales aggregation for the MCP's menu-engineering surface.
 *
 * A tenant's orders live in ONE of three backends (see `order-backend.ts`):
 * the shared platform Supabase, the tenant's own Supabase project, or the
 * tenant's own Convex deployment. Each is queried by a different shell and
 * normalized into `ItemSalesRow` before it arrives here, so this module is the
 * single place per-item popularity is computed — and the only place the
 * arithmetic has to be right.
 *
 * The `coverage` field is not decoration. Reading a Convex-backed tenant's
 * orders out of the platform database returns zero rows, and if that renders as
 * "every item sold nothing" the classifier downstream will label the whole menu
 * a dog and advise the merchant to delete their best sellers. Absence of data
 * and a real zero are therefore different values here, always.
 *
 * The I/O shell is `menu-performance.ts`; this file has no imports by design.
 */

/** Which backend actually answered the read. */
export type MenuPerformanceSource = 'platform' | 'tenant_supabase' | 'convex'

/** One order line, normalized from whichever backend produced it. */
export interface ItemSalesRow {
  /** Null when the menu item has since been deleted (`on delete set null`). */
  menuItemId: string | null
  name: string
  quantity: number
  revenue: number
}

export interface ItemPerformance {
  itemId: string | null
  name: string
  units: number
  revenue: number
  /** Fraction of the window's total units, 0..1. */
  unitShare: number
  /** Fraction of the window's total revenue, 0..1. */
  revenueShare: number
}

export interface MenuPerformanceCoverage {
  /** False when the read saw nothing, or knowingly saw only part of the window. */
  complete: boolean
  note?: string
}

export interface MenuPerformance {
  dataSource: MenuPerformanceSource
  windowDays: number
  totalUnits: number
  totalRevenue: number
  items: ItemPerformance[]
  coverage: MenuPerformanceCoverage
}

export interface BuildMenuPerformanceParams {
  dataSource: MenuPerformanceSource
  windowDays: number
  rows: readonly ItemSalesRow[]
  /** Set when the backend capped the rows it returned (Convex take/limit). */
  truncated?: boolean
}

/** Coerces a possibly-string numeric (PostgREST `numeric`) to a finite number. */
function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * A deleted item has no id, so its lines are grouped by name instead — those are
 * still real sales and collapsing every deleted item into one "null" bucket
 * would invent a phantom best-seller.
 */
function groupKeyOf(row: ItemSalesRow): string {
  return row.menuItemId ?? `name:${row.name}`
}

/**
 * Group order lines into per-item totals, sorted by revenue descending.
 * Shares are 0 (not NaN) when the window sold nothing.
 */
export function aggregateItemSales(rows: readonly ItemSalesRow[]): ItemPerformance[] {
  const totals = new Map<string, ItemPerformance>()

  for (const row of rows) {
    const key = groupKeyOf(row)
    const existing = totals.get(key)
    const units = toNumber(row.quantity)
    const revenue = toNumber(row.revenue)

    // Immutable update: replace the entry rather than mutating it in place.
    totals.set(key, {
      itemId: row.menuItemId,
      name: existing?.name ?? row.name,
      units: (existing?.units ?? 0) + units,
      revenue: (existing?.revenue ?? 0) + revenue,
      unitShare: 0,
      revenueShare: 0,
    })
  }

  const aggregates = [...totals.values()]
  const totalUnits = aggregates.reduce((sum, a) => sum + a.units, 0)
  const totalRevenue = aggregates.reduce((sum, a) => sum + a.revenue, 0)

  return aggregates
    .map((a) => ({
      ...a,
      unitShare: totalUnits > 0 ? a.units / totalUnits : 0,
      revenueShare: totalRevenue > 0 ? a.revenue / totalRevenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

/** Describes what the read could and could not see. */
function coverageOf(itemCount: number, truncated: boolean): MenuPerformanceCoverage {
  if (itemCount === 0) {
    return {
      complete: false,
      note: 'No order data in this window — this is an absence of evidence, not evidence that items sold nothing. Do not classify a menu from it.',
    }
  }
  if (truncated) {
    return {
      complete: false,
      note: 'Partial read: the backend truncated the result set, so low-volume items may be missing from the tail.',
    }
  }
  return { complete: true }
}

/** Assemble the full performance payload the MCP hands back to the model. */
export function buildMenuPerformance({
  dataSource,
  windowDays,
  rows,
  truncated = false,
}: BuildMenuPerformanceParams): MenuPerformance {
  const items = aggregateItemSales(rows)

  return {
    dataSource,
    windowDays,
    totalUnits: items.reduce((sum, i) => sum + i.units, 0),
    totalRevenue: items.reduce((sum, i) => sum + i.revenue, 0),
    items,
    coverage: coverageOf(items.length, truncated),
  }
}

/**
 * Normalize `analytics:getTopItems` as it is ALREADY DEPLOYED to every tenant
 * Convex deployment (`convex-template/convex/analytics.ts`). The shape is fixed
 * by that deployed code, not chosen here — a tenant on an older bundle may send
 * a row missing fields, which degrades to zero rather than throwing.
 */
export function convexTopItemsToRows(items: readonly unknown[]): ItemSalesRow[] {
  return items.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object').map((i) => ({
    menuItemId: typeof i.itemId === 'string' ? i.itemId : null,
    name: typeof i.name === 'string' ? i.name : 'Unknown item',
    quantity: toNumber(i.count),
    revenue: toNumber(i.revenue),
  }))
}

/**
 * Normalize joined `order_items` rows from either Supabase project. `subtotal`
 * is `numeric(10,2)`, which PostgREST serializes as a STRING — adding those with
 * `+` would concatenate revenue instead of summing it.
 */
export function platformOrderItemsToRows(rows: readonly unknown[]): ItemSalesRow[] {
  return rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').map((r) => ({
    menuItemId: typeof r.menu_item_id === 'string' ? r.menu_item_id : null,
    name: typeof r.menu_item_name === 'string' ? r.menu_item_name : 'Unknown item',
    quantity: toNumber(r.quantity),
    revenue: toNumber(r.subtotal),
  }))
}
