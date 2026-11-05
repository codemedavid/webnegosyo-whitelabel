import {
  mergeExpenseCategories,
  mergePaymentBuckets,
  mergeProfitFigures,
  mergeProfitPeriods,
  mergeSalesTotals,
} from '@/lib/reports/read/merge-report-rows'
import type { ExpenseCategoryTotal, ProfitFigures, ProfitPeriodFigures } from '@/lib/reports/profit-facts'
import type { PaymentBucket } from '@/lib/reports/payment-buckets'

const GROUPS = { ingredients: 0, staff: 0, occupancy: 0, utilities: 0, operating: 0, admin: 0, other: 0, capex: 0, not_expense: 0 }

function profit(overrides: Partial<ProfitFigures>): ProfitFigures {
  return {
    orders: 0,
    netSalesCents: 0,
    collectedCents: 0,
    saleMovements: 0,
    ledgerCogsCents: 0,
    fallbackCogsCents: 0,
    fallbackOrders: 0,
    wasteCents: 0,
    countVarianceCents: 0,
    uncostedMovements: 0,
    soldQuantity: 0,
    costedQuantity: 0,
    soldDishes: 0,
    costedDishes: 0,
    dishCostsVisible: true,
    groupCents: GROUPS,
    ingredientStockCents: 0,
    expenseCount: 0,
    storeWideExpenseCents: 0,
    unsortedPayouts: 0,
    unsortedPayoutCents: 0,
    ...overrides,
  }
}

describe('mergeSalesTotals', () => {
  it('reads as zero with no parts', () => {
    expect(mergeSalesTotals([])).toMatchObject({ orders: 0, netCents: 0, aovCents: null })
  })
})

describe('mergePaymentBuckets', () => {
  const bucket = (key: string, label: string, cents: number, orders = 1): PaymentBucket => ({
    key,
    label,
    type: label,
    methodId: key.startsWith('id:') ? key.slice(3) : null,
    cents,
    orders,
  })

  it('adds a method across months and lists the largest first', () => {
    const merged = mergePaymentBuckets([
      [bucket('id:cash', 'Cash', 500), bucket('id:gcash', 'GCash', 900)],
      [bucket('id:cash', 'Cash', 700, 2)],
    ])
    expect(merged).toEqual([bucket('id:cash', 'Cash', 1200, 3), bucket('id:gcash', 'GCash', 900)])
  })

  it('joins a month where "Cash" was only typed by name into the Cash method', () => {
    const merged = mergePaymentBuckets([[bucket('name:cash', 'Cash', 300)], [bucket('id:cash-id', 'Cash', 700)]])
    expect(merged).toEqual([bucket('id:cash-id', 'Cash', 1000, 2)])
  })

  it('keeps a typed name apart when two methods share it', () => {
    const merged = mergePaymentBuckets([
      [bucket('name:cash', 'Cash', 300)],
      [bucket('id:a', 'Cash', 700), bucket('id:b', 'Cash', 100)],
    ])
    expect(merged.map((row) => row.key)).toEqual(['id:a', 'name:cash', 'id:b'])
  })
})

describe('mergeProfitFigures', () => {
  it('adds every amount and count, and adds expense groups', () => {
    const merged = mergeProfitFigures([
      profit({ orders: 2, netSalesCents: 1000, ledgerCogsCents: 300, groupCents: { ...GROUPS, staff: 500 }, expenseCount: 1 }),
      profit({ orders: 3, netSalesCents: 2000, ledgerCogsCents: 700, groupCents: { ...GROUPS, staff: 250 }, expenseCount: 2 }),
    ])
    expect(merged).toMatchObject({ orders: 5, netSalesCents: 3000, ledgerCogsCents: 1000, expenseCount: 3 })
    expect(merged.groupCents.staff).toBe(750)
  })

  it('keeps the dish counts as the largest part (a distinct count cannot be added)', () => {
    const merged = mergeProfitFigures([profit({ soldDishes: 12, costedDishes: 9 }), profit({ soldDishes: 15, costedDishes: 8 })])
    expect(merged).toMatchObject({ soldDishes: 15, costedDishes: 9 })
  })

  it('shows dish costs only when every part could', () => {
    expect(mergeProfitFigures([profit({}), profit({ dishCostsVisible: false })]).dishCostsVisible).toBe(false)
  })
})

describe('mergeProfitPeriods', () => {
  const row = (bucket: string, netSalesCents: number): ProfitPeriodFigures => ({
    bucket,
    orders: 1,
    netSalesCents,
    collectedCents: netSalesCents,
    saleMovements: 0,
    ledgerCogsCents: 0,
    fallbackCogsCents: 0,
    wasteCents: 0,
    countVarianceCents: 0,
    ingredientDirectCents: 0,
    ingredientStockCents: 0,
    expensesCents: 0,
    cashOutCents: 0,
  })

  it('adds a bucket split across two parts and keeps buckets in order', () => {
    const merged = mergeProfitPeriods([[row('2026-02-01', 100), row('2026-01-01', 50)], [row('2026-02-01', 25)]])
    expect(merged.map((r) => [r.bucket, r.netSalesCents, r.orders])).toEqual([
      ['2026-01-01', 50, 1],
      ['2026-02-01', 125, 2],
    ])
  })
})

describe('mergeExpenseCategories', () => {
  const category = (categoryId: string, cents: number, name = 'Rent'): ExpenseCategoryTotal => ({
    categoryId,
    name,
    icon: null,
    group: 'occupancy',
    systemKey: null,
    cents,
    stockPurchaseCents: 0,
    expenses: 1,
  })

  it('adds a category across parts, newest name wins, largest first', () => {
    const merged = mergeExpenseCategories([[category('a', 100, 'Rent'), category('b', 500)], [category('a', 600, 'Store rent')]])
    expect(merged).toEqual([
      { ...category('a', 700, 'Store rent'), expenses: 2 },
      category('b', 500),
    ])
  })
})
