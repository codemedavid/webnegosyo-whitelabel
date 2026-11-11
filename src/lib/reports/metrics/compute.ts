/**
 * Registry metric values from the report engine's figures (plan 2026-11-05
 * §5.1). Nothing here defines a sales or profit number: it only names and
 * divides what `sales-model.ts` (via the SQL twins) and `profit-model.ts`
 * already computed, so a card, a column and an export always agree.
 *
 * A metric that could not be computed for lack of input is LEFT OUT; one that
 * has nothing to divide by is `null` (shown as "—", never as 0).
 */

import type { ProfitReport, ProfitTrendPoint } from '../profit-model'
import type { BreakdownRow, PeriodRow } from '../sales-breakdowns'
import type { SalesTotals } from '../read/report-rpc-rows'
import type { MetricId } from './registry'

export type MetricValues = Partial<Record<MetricId, number | null>>

function divide(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** Centavos per something, rounded to a whole centavo. */
function centsPer(cents: number, count: number): number | null {
  return count > 0 ? Math.round(cents / count) + 0 : null
}

type ProfitParts = Pick<ProfitReport, 'netSalesCents' | 'ingredientCostCents' | 'expensesCents' | 'profitCents'>

function profitValues(profit: ProfitParts): MetricValues {
  const grossProfit = profit.netSalesCents - profit.ingredientCostCents
  return {
    cost_of_food: profit.ingredientCostCents,
    gross_profit: grossProfit,
    gross_margin_pct: divide(grossProfit, profit.netSalesCents),
    food_cost_pct: divide(profit.ingredientCostCents, profit.netSalesCents),
    expenses: profit.expensesCents,
    profit: profit.profitCents,
  }
}

/** The cost metrics of a whole period, from the profit model's report. */
export function profitMetricValues(profit: ProfitParts & Pick<ProfitReport, 'coverage'>): MetricValues {
  return { ...profitValues(profit), cost_coverage_pct: profit.coverage.costedShare }
}

export interface SummaryInput {
  totals: SalesTotals
  /** Business days in the period (so far, for a running period). */
  days: number
  /** Σ pieces sold, when the item or category rows were read. */
  itemsSold?: number
  profit?: Pick<ProfitReport, 'netSalesCents' | 'ingredientCostCents' | 'expensesCents' | 'profitCents' | 'coverage'>
}

export function summaryValues({ totals, days, itemsSold, profit }: SummaryInput): MetricValues {
  const values: MetricValues = {
    net_sales: totals.netCents,
    gross_sales: totals.grossCents,
    discounts: totals.discountCents,
    orders: totals.orders,
    aov: totals.aovCents,
    avg_sales_per_day: centsPer(totals.netCents, days),
    avg_orders_per_day: divide(totals.orders, days),
    money_received: totals.collectedCents,
    still_to_collect: totals.unpaidCents,
    service_charge: totals.serviceCents,
    delivery_fees: totals.deliveryCents,
    cancelled_orders: totals.voids.orders,
  }
  const withItems: MetricValues =
    itemsSold === undefined
      ? values
      : {
          ...values,
          items_sold: itemsSold,
          items_per_order: divide(itemsSold, totals.orders),
          avg_item_price: centsPer(totals.netCents, itemsSold),
        }
  return profit ? { ...withItems, ...profitMetricValues(profit) } : withItems
}

export function periodValues(row: PeriodRow, profit?: ProfitTrendPoint): MetricValues {
  const values: MetricValues = {
    net_sales: row.netCents,
    gross_sales: row.grossCents,
    discounts: row.discountCents,
    orders: row.orders,
    aov: centsPer(row.netCents, row.orders),
    money_received: row.collectedCents,
  }
  return profit ? { ...values, ...profitValues({ ...profit, netSalesCents: row.netCents }) } : values
}

export function breakdownValues(row: BreakdownRow, totalNetCents: number): MetricValues {
  return {
    net_sales: row.netCents,
    gross_sales: row.grossCents,
    discounts: row.discountCents,
    orders: row.orders,
    aov: centsPer(row.netCents, row.orders),
    items_sold: row.quantity,
    avg_item_price: centsPer(row.netCents, row.quantity),
    share_of_sales: divide(row.netCents, totalNetCents),
  }
}

export function paymentValues(bucket: { cents: number; orders: number }, collectedCents: number): MetricValues {
  return { money_received: bucket.cents, orders: bucket.orders, share_of_sales: divide(bucket.cents, collectedCents) }
}
