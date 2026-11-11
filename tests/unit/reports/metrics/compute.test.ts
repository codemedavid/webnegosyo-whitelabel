import { breakdownValues, paymentValues, periodValues, summaryValues } from '@/lib/reports/metrics/compute'
import { METRICS, METRIC_IDS, visibleMetrics } from '@/lib/reports/metrics/registry'
import type { SalesTotals } from '@/lib/reports/read/report-rpc-rows'
import type { ProfitReport } from '@/lib/reports/profit-model'

const TOTALS: SalesTotals = {
  orders: 40,
  grossCents: 1_100_000,
  discountCents: 100_000,
  deliveryDiscountCents: 0,
  refundCents: 0,
  netCents: 1_000_000,
  serviceCents: 20_000,
  deliveryCents: 30_000,
  billedCents: 1_050_000,
  collectedCents: 1_000_000,
  unpaidCents: 50_000,
  overpaidCents: 0,
  aovCents: 25_000,
  voids: { orders: 2, billedCents: 9_000 },
  coverage: { ordersWithoutLines: 0, ordersLinesMismatch: 0, lineGapCents: 0 },
}

const PROFIT = {
  netSalesCents: 1_000_000,
  ingredientCostCents: 320_000,
  expensesCents: 400_000,
  profitCents: 280_000,
  ratios: { profit: 0.28, food: 0.32, staff: null, rent: null, prime: null },
  coverage: { costedShare: 0.95 },
} as unknown as ProfitReport

describe('the metric registry', () => {
  it('has an entry, a label and a definition for every id', () => {
    for (const id of METRIC_IDS) {
      expect(METRICS[id]).toMatchObject({ id })
      expect(METRICS[id].label.length).toBeGreaterThan(0)
      expect(METRICS[id].definition.length).toBeGreaterThan(10)
      expect(METRICS[id].scopes.length).toBeGreaterThan(0)
    }
  })

  it('every ratio and percentage is recomputed, never added', () => {
    for (const id of METRIC_IDS) {
      if (METRICS[id].format === 'percent') expect(METRICS[id].aggregation).toBe('ratio')
    }
  })

  it('hides every cost figure from an account without the costs key', () => {
    const ids = visibleMetrics(false).map((metric) => metric.id)
    expect(ids).toContain('net_sales')
    expect(ids).not.toContain('cost_of_food')
    expect(ids).not.toContain('gross_margin_pct')
    expect(ids).not.toContain('profit')
    expect(visibleMetrics(true)).toHaveLength(METRIC_IDS.length)
  })
})

describe('summaryValues', () => {
  it('reads the sales figures and the per-day averages', () => {
    const values = summaryValues({ totals: TOTALS, days: 8, itemsSold: 100 })
    expect(values).toMatchObject({
      net_sales: 1_000_000,
      gross_sales: 1_100_000,
      discounts: 100_000,
      orders: 40,
      aov: 25_000,
      items_sold: 100,
      items_per_order: 2.5,
      avg_item_price: 10_000,
      avg_sales_per_day: 125_000,
      avg_orders_per_day: 5,
      money_received: 1_000_000,
      still_to_collect: 50_000,
      service_charge: 20_000,
      delivery_fees: 30_000,
      cancelled_orders: 2,
    })
  })

  it('leaves out what it was not given: no items read, no profit', () => {
    const values = summaryValues({ totals: TOTALS, days: 8 })
    expect(values).not.toHaveProperty('items_sold')
    expect(values).not.toHaveProperty('items_per_order')
    expect(values).not.toHaveProperty('cost_of_food')
  })

  it('reads ratios as null, not zero, with nothing to divide by', () => {
    const values = summaryValues({ totals: { ...TOTALS, orders: 0, netCents: 0, aovCents: null }, days: 0, itemsSold: 0 })
    expect(values).toMatchObject({ aov: null, items_per_order: null, avg_item_price: null, avg_sales_per_day: null, avg_orders_per_day: null })
  })

  it('adds profit figures from the profit model', () => {
    const values = summaryValues({ totals: TOTALS, days: 8, profit: PROFIT })
    expect(values).toMatchObject({
      cost_of_food: 320_000,
      gross_profit: 680_000,
      gross_margin_pct: 0.68,
      food_cost_pct: 0.32,
      expenses: 400_000,
      profit: 280_000,
      cost_coverage_pct: 0.95,
    })
  })
})

describe('row values', () => {
  it('a period row', () => {
    expect(
      periodValues(
        { key: '2026-10-01', orders: 4, grossCents: 1200, discountCents: 200, netCents: 1000, billedCents: 1100, collectedCents: 900 },
        { bucket: '2026-10-01', netSalesCents: 1000, ingredientCostCents: 300, expensesCents: 100, profitCents: 600, cashInCents: 900, cashOutCents: 0 },
      ),
    ).toEqual({
      net_sales: 1000,
      gross_sales: 1200,
      discounts: 200,
      orders: 4,
      aov: 250,
      money_received: 900,
      cost_of_food: 300,
      gross_profit: 700,
      gross_margin_pct: 0.7,
      food_cost_pct: 0.3,
      expenses: 100,
      profit: 600,
    })
  })

  it('a breakdown row, with its share of the whole', () => {
    expect(
      breakdownValues({ key: 'x', label: 'Tapsilog', orders: 5, quantity: 8, grossCents: 1000, discountCents: 200, netCents: 800 }, 3200),
    ).toEqual({
      net_sales: 800,
      gross_sales: 1000,
      discounts: 200,
      orders: 5,
      aov: 160,
      items_sold: 8,
      avg_item_price: 100,
      share_of_sales: 0.25,
    })
  })

  it('a payment method', () => {
    expect(paymentValues({ cents: 300, orders: 3 }, 1200)).toEqual({ money_received: 300, orders: 3, share_of_sales: 0.25 })
  })
})
