/**
 * Merges the rows of several report reads over consecutive, non-overlapping
 * windows (`report-chunks.ts`) into what one read of the whole window returns.
 *
 * Every order lives in exactly one window, so counts and centavos add up.
 * Parts are passed OLDEST FIRST: a label (item name, category, payment
 * method) is taken from the newest part that has the row, as the engine takes
 * the newest name. Ratios (average order) are recomputed from the merged
 * parts, never averaged. Pinned against the engine by
 * `tests/unit/reports/read/merge-report-rows.property.test.ts`.
 *
 * Pure.
 */

import type { ExpenseCategoryTotal, ProfitFigures, ProfitPeriodFigures } from '../profit-facts'
import { byCentsThenLabel, methodKey, type PaymentBucket } from '../payment-buckets'
import { byNetThenLabel, type BreakdownRow, type HourCell, type PeriodRow } from '../sales-breakdowns'
import type { SalesTotals } from './report-rpc-rows'

const TOTALS_ADDITIVE_KEYS = [
  'orders',
  'grossCents',
  'discountCents',
  'deliveryDiscountCents',
  'refundCents',
  'netCents',
  'serviceCents',
  'deliveryCents',
  'billedCents',
  'collectedCents',
  'unpaidCents',
  'overpaidCents',
] as const satisfies readonly (keyof SalesTotals)[]

const EMPTY_TOTALS: SalesTotals = {
  orders: 0,
  grossCents: 0,
  discountCents: 0,
  deliveryDiscountCents: 0,
  refundCents: 0,
  netCents: 0,
  serviceCents: 0,
  deliveryCents: 0,
  billedCents: 0,
  collectedCents: 0,
  unpaidCents: 0,
  overpaidCents: 0,
  aovCents: null,
  voids: { orders: 0, billedCents: 0 },
  coverage: { ordersWithoutLines: 0, ordersLinesMismatch: 0, lineGapCents: 0 },
}

function addTotals(acc: SalesTotals, part: SalesTotals): SalesTotals {
  const sums = Object.fromEntries(TOTALS_ADDITIVE_KEYS.map((key) => [key, acc[key] + part[key]])) as Pick<
    SalesTotals,
    (typeof TOTALS_ADDITIVE_KEYS)[number]
  >
  return {
    ...acc,
    ...sums,
    voids: { orders: acc.voids.orders + part.voids.orders, billedCents: acc.voids.billedCents + part.voids.billedCents },
    coverage: {
      ordersWithoutLines: acc.coverage.ordersWithoutLines + part.coverage.ordersWithoutLines,
      ordersLinesMismatch: acc.coverage.ordersLinesMismatch + part.coverage.ordersLinesMismatch,
      lineGapCents: acc.coverage.lineGapCents + part.coverage.lineGapCents,
    },
  }
}

export function mergeSalesTotals(parts: readonly SalesTotals[]): SalesTotals {
  const merged = parts.reduce(addTotals, EMPTY_TOTALS)
  // Same rounding as summarizeSales / toSalesTotals (`+ 0` turns −0 into 0).
  return { ...merged, aovCents: merged.orders > 0 ? Math.round(merged.netCents / merged.orders) + 0 : null }
}

function byKeyAscending(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

export function mergePeriodRows(parts: readonly (readonly PeriodRow[])[]): PeriodRow[] {
  const rows = new Map<string, PeriodRow>()
  for (const row of parts.flat()) {
    const base = rows.get(row.key)
    rows.set(
      row.key,
      base
        ? {
            key: row.key,
            orders: base.orders + row.orders,
            grossCents: base.grossCents + row.grossCents,
            discountCents: base.discountCents + row.discountCents,
            netCents: base.netCents + row.netCents,
            billedCents: base.billedCents + row.billedCents,
            collectedCents: base.collectedCents + row.collectedCents,
          }
        : row,
    )
  }
  return [...rows.values()].sort(byKeyAscending)
}

/**
 * Items, categories, channels, order types, branches. Fields other than the
 * sums (label, menu item id, category …) come from the newest part; a
 * category label the newest part does not know is kept from an older one.
 */
export function mergeBreakdownRows<Row extends BreakdownRow & { categoryLabel?: string | null }>(
  parts: readonly (readonly Row[])[],
): Row[] {
  const rows = new Map<string, Row>()
  for (const row of parts.flat()) {
    const base = rows.get(row.key)
    if (!base) {
      rows.set(row.key, row)
      continue
    }
    const merged: Row = {
      ...row,
      orders: base.orders + row.orders,
      quantity: base.quantity + row.quantity,
      grossCents: base.grossCents + row.grossCents,
      discountCents: base.discountCents + row.discountCents,
      netCents: base.netCents + row.netCents,
    }
    rows.set(row.key, 'categoryLabel' in row ? { ...merged, categoryLabel: row.categoryLabel ?? base.categoryLabel ?? null } : merged)
  }
  return [...rows.values()].sort(byNetThenLabel)
}

export function mergeHourCells(parts: readonly (readonly HourCell[])[]): HourCell[] {
  const cells = new Map<number, HourCell>()
  for (const cell of parts.flat()) {
    const index = cell.weekday * 24 + cell.hour
    const base = cells.get(index)
    cells.set(index, base ? { ...cell, orders: base.orders + cell.orders, netCents: base.netCents + cell.netCents } : cell)
  }
  return [...cells.entries()].sort(([a], [b]) => a - b).map(([, cell]) => cell)
}

function addBucket(base: PaymentBucket | undefined, bucket: PaymentBucket): PaymentBucket {
  return base ? { ...bucket, cents: base.cents + bucket.cents, orders: base.orders + bucket.orders } : bucket
}

/**
 * The engine's name alias across the merged window: a month that only saw
 * "Cash" typed by name, and a month that saw the Cash method by id, end up in
 * ONE row when exactly one id carries that name (payment-buckets.ts
 * `nameAliases`). An order lives in one month, so nothing is counted twice.
 */
function joinNameOnlyBuckets(buckets: ReadonlyMap<string, PaymentBucket>): PaymentBucket[] {
  const idsByName = new Map<string, PaymentBucket[]>()
  for (const bucket of buckets.values()) {
    if (!bucket.key.startsWith('id:')) continue
    const nameKey = methodKey(null, bucket.label)
    idsByName.set(nameKey, [...(idsByName.get(nameKey) ?? []), bucket])
  }
  const joined = new Map<string, PaymentBucket>()
  for (const bucket of buckets.values()) {
    const targets = idsByName.get(bucket.key)
    const target = targets?.length === 1 ? targets[0] : null
    if (target) {
      const base = joined.get(target.key) ?? target
      joined.set(target.key, { ...base, cents: base.cents + bucket.cents, orders: base.orders + bucket.orders })
    } else if (!joined.has(bucket.key)) {
      joined.set(bucket.key, bucket)
    }
  }
  return [...joined.values()]
}

export function mergePaymentBuckets(parts: readonly (readonly PaymentBucket[])[]): PaymentBucket[] {
  const buckets = new Map<string, PaymentBucket>()
  for (const bucket of parts.flat()) buckets.set(bucket.key, addBucket(buckets.get(bucket.key), bucket))
  return joinNameOnlyBuckets(buckets).sort(byCentsThenLabel)
}

// ---------------------------------------------------------------------------
// Profit
// ---------------------------------------------------------------------------

const PROFIT_ADDITIVE_KEYS = [
  'orders',
  'netSalesCents',
  'collectedCents',
  'saleMovements',
  'ledgerCogsCents',
  'fallbackCogsCents',
  'fallbackOrders',
  'wasteCents',
  'countVarianceCents',
  'uncostedMovements',
  'soldQuantity',
  'costedQuantity',
  'ingredientStockCents',
  'expenseCount',
  'storeWideExpenseCents',
  'unsortedPayouts',
  'unsortedPayoutCents',
] as const satisfies readonly (keyof ProfitFigures)[]

function addGroups(a: ProfitFigures['groupCents'], b: ProfitFigures['groupCents']): ProfitFigures['groupCents'] {
  return Object.fromEntries(Object.keys(a).map((group) => [group, a[group as keyof typeof a] + (b[group as keyof typeof b] ?? 0)])) as ProfitFigures['groupCents']
}

/**
 * `soldDishes` / `costedDishes` are DISTINCT dishes, which cannot be added
 * across months: the merge keeps the largest month's count, a lower bound
 * that still says "some dishes have no cost" whenever any month did.
 */
export function mergeProfitFigures(parts: readonly ProfitFigures[]): ProfitFigures {
  const [first, ...rest] = parts
  if (!first) throw new Error('mergeProfitFigures needs at least one part')
  return rest.reduce<ProfitFigures>((acc, part) => {
    const sums = Object.fromEntries(PROFIT_ADDITIVE_KEYS.map((key) => [key, acc[key] + part[key]])) as Pick<
      ProfitFigures,
      (typeof PROFIT_ADDITIVE_KEYS)[number]
    >
    return {
      ...acc,
      ...sums,
      soldDishes: Math.max(acc.soldDishes, part.soldDishes),
      costedDishes: Math.max(acc.costedDishes, part.costedDishes),
      dishCostsVisible: acc.dishCostsVisible && part.dishCostsVisible,
      groupCents: addGroups(acc.groupCents, part.groupCents),
    }
  }, first)
}

const PROFIT_PERIOD_ADDITIVE_KEYS = [
  'orders',
  'netSalesCents',
  'collectedCents',
  'saleMovements',
  'ledgerCogsCents',
  'fallbackCogsCents',
  'wasteCents',
  'countVarianceCents',
  'ingredientDirectCents',
  'ingredientStockCents',
  'expensesCents',
  'cashOutCents',
] as const satisfies readonly (keyof ProfitPeriodFigures)[]

export function mergeProfitPeriods(parts: readonly (readonly ProfitPeriodFigures[])[]): ProfitPeriodFigures[] {
  const rows = new Map<string, ProfitPeriodFigures>()
  for (const row of parts.flat()) {
    const base = rows.get(row.bucket)
    if (!base) {
      rows.set(row.bucket, row)
      continue
    }
    const sums = Object.fromEntries(PROFIT_PERIOD_ADDITIVE_KEYS.map((key) => [key, base[key] + row[key]])) as Pick<
      ProfitPeriodFigures,
      (typeof PROFIT_PERIOD_ADDITIVE_KEYS)[number]
    >
    rows.set(row.bucket, { ...row, ...sums })
  }
  return [...rows.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0))
}

export function mergeExpenseCategories(parts: readonly (readonly ExpenseCategoryTotal[])[]): ExpenseCategoryTotal[] {
  const rows = new Map<string, ExpenseCategoryTotal>()
  for (const row of parts.flat()) {
    const base = rows.get(row.categoryId)
    rows.set(
      row.categoryId,
      base
        ? {
            ...row,
            cents: base.cents + row.cents,
            stockPurchaseCents: base.stockPurchaseCents + row.stockPurchaseCents,
            expenses: base.expenses + row.expenses,
          }
        : row,
    )
  }
  return [...rows.values()].sort((a, b) => b.cents - a.cents || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
