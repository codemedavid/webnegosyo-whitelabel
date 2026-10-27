/**
 * @jest-environment node
 *
 * The SQL profit functions agree with the TypeScript profit engine to the
 * centavo (expense plan §7 "SQL twin", §9 "Property").
 *
 * Generated stores (tests/fixtures/profit-stores.ts: orders, the stock
 * ledger, dish costs, expenses, drawer pay-outs) are written to PGlite with
 * the live RLS slice and the REAL expense-book and profit migrations, and
 * every profit function is called AS THE STORE'S OWNER for the whole store,
 * one branch and the unassigned rows. Their rows, mapped by the production
 * mappers (report-profit-rows.ts), must equal profit-facts.ts over the same
 * rows. The sales summary is called too: profit's net sales IS the sales net.
 *
 * PGlite runs in a child process (tests/sql/report-profit-worker.cjs).
 * Stores per run = FC_NUM_RUNS (capped at MAX_STORES); FC_SEED replays.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fc from 'fast-check'
import {
  expensesByCategory,
  profitFigures,
  profitFiguresByPeriod,
  PROFIT_GRAINS,
  type ProfitRawInput,
  type ProfitScope,
} from '@/lib/reports/profit-facts'
import { toExpenseCategoryTotals, toProfitFigures, toProfitPeriods } from '@/lib/reports/read/report-profit-rows'
import { toSalesTotals } from '@/lib/reports/read/report-rpc-rows'
import { toReportOrder, type PlatformOrderItemRow, type PlatformOrderRow, type PlatformPaymentRow } from '@/lib/reports/read/platform-order-row'
import { isLiveOrder } from '@/lib/reports/sales-model'
import { toPlatformTables } from '../../fixtures/report-orders'
import { BRANCHES, PROFIT_CATEGORIES, profitStoreArb, type ProfitStore } from '../../fixtures/profit-stores'
import { propertyRuns } from '../../utils/property'
import type { CutoffSchedule } from '@/lib/business-day/trading-day'
import { line, order } from './report-fixtures'

const MAX_STORES = 400
const WORKER = path.join(process.cwd(), 'tests/sql/report-profit-worker.cjs')
const DAY_MS = 24 * 60 * 60 * 1000
/** Two Manila weeks across a month end (2026-09-25 … 2026-10-08). */
const WINDOW = { start: Date.parse('2026-09-24T16:00:00.000Z'), end: Date.parse('2026-10-08T16:00:00.000Z') }
/** Rows are drawn two days either side, so the bounds are exercised. */
const SPREAD = { start: WINDOW.start - 2 * DAY_MS, end: WINDOW.end + 2 * DAY_MS }
/** A "so far" window that ends mid-afternoon: that day's expenses count. */
const PARTIAL = { start: WINDOW.start, end: WINDOW.end - 9 * 60 * 60 * 1000 }

function uuidFactory() {
  let counter = 0
  const ids = new Map<string, string>()
  return (key: string): string => {
    const known = ids.get(key)
    if (known) return known
    counter += 1
    const hex = counter.toString(16).padStart(32, '0')
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
    ids.set(key, id)
    return id
  }
}

interface Materialized {
  tenantId: string
  ownerId: string
  branchId: string
  seed: Record<string, Array<Record<string, unknown>>>
  raw: Omit<ProfitRawInput, 'scope'>
}

/**
 * A random business-day schedule per store (20261027180000), derived from the
 * run seed: half the stores keep Manila midnight, the rest get one to three
 * cutoff changes around and inside the window (constant-cutoff fast path,
 * 20 h / 28 h transition days, expense windows by business-day start).
 */
function scheduleFor(index: number, seed: number): CutoffSchedule {
  let state = (seed * 7919 + index * 104729) >>> 0
  const next = (n: number) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    return state % n
  }
  if (index === 0 || next(2) === 0) return []
  const days = new Set<number>()
  const count = 1 + next(3)
  for (let i = 0; i < count; i += 1) days.add(next(22))
  const base = Date.parse('2026-09-20T00:00:00.000Z')
  return [...days]
    .sort((a, b) => a - b)
    .map((offset) => ({ effectiveFrom: new Date(base + offset * DAY_MS).toISOString().slice(0, 10), cutoffMinutes: next(48) * 15 }))
}

/** One generated store with real ids, as SQL rows AND as the engine's input. */
function materialize(store: ProfitStore, index: number, uuid: (key: string) => string, runSeed: number): Materialized {
  const tenantId = uuid(`tenant:${index}`)
  const ownerId = uuid(`owner:${index}`)
  const local = (id: string) => uuid(`${index}:${id}`)
  const outlet = (id: string | null) => (id === null ? null : local(`outlet:${id}`))
  const tables = toPlatformTables(store.orders, { tenantId, moneyAsText: index % 2 === 0 })
  const orders = tables.orders.map((row) => ({ ...row, id: local(row.id), outlet_id: outlet(row.outlet_id), payment_method_id: null }))
  const items = tables.items.map((row) => ({
    id: local(row.id),
    order_id: local(row.order_id),
    menu_item_id: row.menu_item_id && local(row.menu_item_id),
    menu_item_name: row.menu_item_name,
    category_name: row.category_name,
    quantity: row.quantity,
    subtotal: row.subtotal,
  }))
  const payments = tables.payments.filter((row) => Number(row.amount) > 0).map((row) => ({ ...row, order_id: local(row.order_id), payment_method_id: null }))
  const dishCosts = store.dishCosts.map((cost) => ({ order_item_id: local(cost.lineId), tenant_id: tenantId, unit_cost: cost.unitCost }))
  const movements = store.movements.map((move) => ({
    tenant_id: tenantId,
    reason: move.reason,
    quantity_delta: String(move.quantityDelta),
    unit_cost: move.unitCost === null ? null : String(move.unitCost),
    order_id: move.orderId === null ? null : local(move.orderId),
    outlet_id: outlet(move.outletId),
    created_at: new Date(move.at).toISOString(),
  }))
  const payouts = store.payouts.map((payout) => ({
    id: local(payout.id),
    tenant_id: tenantId,
    outlet_id: outlet(payout.outletId),
    kind: payout.kind,
    amount: String(payout.amount),
    reason: 'Ice',
    created_at: new Date(payout.at).toISOString(),
  }))
  const categories = PROFIT_CATEGORIES.map((category, sort) => ({
    id: local(`category:${category.key}`),
    tenant_id: tenantId,
    system_key: category.systemKey,
    name: category.name,
    icon: category.icon,
    grp: category.group,
    sort_order: sort * 10,
  }))
  const expenses = store.expenses.map((expense) => ({
    id: local(expense.id),
    tenant_id: tenantId,
    outlet_id: outlet(expense.outletId),
    category_id: local(`category:${expense.categoryId}`),
    amount_cents: expense.amountCents,
    spent_on: expense.spentOn,
    paid_from: expense.shiftCashMovementId ? 'drawer' : 'cash',
    shift_cash_movement_id: expense.shiftCashMovementId && local(expense.shiftCashMovementId),
    is_stock_purchase: expense.isStockPurchase,
    created_by_name: 'Owner',
    void_reason: expense.status === 'void' ? 'Wrong amount' : null,
  }))

  const itemsByOrder = items.reduce(
    (map, row) => map.set(row.order_id, [...(map.get(row.order_id) ?? []), row]),
    new Map<string, typeof items>(),
  )
  const paymentsByOrder = payments.reduce(
    (map, row) => map.set(row.order_id, [...(map.get(row.order_id) ?? []), row]),
    new Map<string, typeof payments>(),
  )
  const raw: Omit<ProfitRawInput, 'scope'> = {
    orders: orders.map((row) =>
      toReportOrder(row as PlatformOrderRow, (itemsByOrder.get(row.id) ?? []) as PlatformOrderItemRow[], (paymentsByOrder.get(row.id) ?? []) as PlatformPaymentRow[]),
    ),
    dishCosts: new Map(dishCosts.map((cost) => [cost.order_item_id, cost.unit_cost])),
    movements: movements.map((row) => ({
      reason: row.reason,
      quantityDelta: row.quantity_delta,
      unitCost: row.unit_cost,
      orderId: row.order_id,
      outletId: row.outlet_id,
      at: Date.parse(row.created_at),
    })),
    expenses: expenses.map((row) => ({
      categoryId: row.category_id,
      amountCents: row.amount_cents,
      spentOn: row.spent_on,
      outletId: row.outlet_id,
      isStockPurchase: row.is_stock_purchase,
      status: row.void_reason ? 'void' : 'recorded',
      shiftCashMovementId: row.shift_cash_movement_id,
    })),
    categories: categories.map((row) => ({ id: row.id, name: row.name, icon: row.icon, group: row.grp, systemKey: row.system_key })),
    payouts: payouts.map((row) => ({ id: row.id, kind: row.kind, amount: row.amount, outletId: row.outlet_id, at: Date.parse(row.created_at) })),
    dishCostsVisible: true,
    schedule: scheduleFor(index, runSeed),
  }
  return {
    tenantId,
    ownerId,
    branchId: outlet(BRANCHES[0]) as string,
    seed: {
      outlets: BRANCHES.map((branch) => ({ id: outlet(branch), tenant_id: tenantId })),
      orders,
      items,
      payments,
      dishCosts,
      movements,
      payouts,
      expenseCategories: categories,
      expenses,
    },
    raw,
  }
}

/** Half-centavo frozen costs, a cancelled order's sale and void (the void after the window), edge-of-window expenses. */
const EDGE_STORE: ProfitStore = {
  orders: [
    // A deleted dish sold under two spellings is ONE dish (folded name), costed once.
    order({
      id: 'e1',
      at: WINDOW.start + 3_600_000,
      total: 200,
      lines: [
        line({ id: 'e1-a', menuItemId: null, name: 'Dish 9', subtotal: 100 }),
        line({ id: 'e1-b', menuItemId: null, name: ' dish  9 ', subtotal: 100, quantity: 3 }),
      ],
    }),
    // Cancelled: no fallback, no coverage.
    order({ id: 'e2', at: WINDOW.start + 7_200_000, status: 'cancelled', lines: [line({ id: 'e2-a' })] }),
  ],
  dishCosts: [
    { lineId: 'e1-a', unitCost: '12.3450' },
    { lineId: 'e2-a', unitCost: '99.0000' },
  ],
  movements: [
    // e2 was sold inside the window and cancelled after it: neither its sale nor its void counts.
    { reason: 'sale', quantityDelta: '-1.0000', unitCost: '7.0000', orderId: 'e2', outletId: null, at: WINDOW.start + 7_200_000 },
    { reason: 'void', quantityDelta: '1.0000', unitCost: '7.0000', orderId: 'e2', outletId: null, at: WINDOW.end + DAY_MS },
    // e1 (live) edited down: its void counts.
    { reason: 'void', quantityDelta: '1.0000', unitCost: '3.0000', orderId: 'e1', outletId: null, at: WINDOW.end - 2 },
    { reason: 'sale', quantityDelta: '-1.0000', unitCost: '0.0050', orderId: null, outletId: null, at: WINDOW.start },
    { reason: 'void', quantityDelta: '1.0000', unitCost: '0.0050', orderId: null, outletId: null, at: WINDOW.start + 1 },
    { reason: 'sale', quantityDelta: '-3.0000', unitCost: '0.0050', orderId: null, outletId: 'b-0', at: WINDOW.end - 1 },
    { reason: 'waste', quantityDelta: '-0.0001', unitCost: '50000.0000', orderId: null, outletId: 'b-1', at: WINDOW.start - 1 },
    { reason: 'stocktake', quantityDelta: '2.5000', unitCost: '10.0010', orderId: null, outletId: null, at: WINDOW.end },
    { reason: 'stocktake', quantityDelta: '-2.5000', unitCost: null, orderId: null, outletId: null, at: WINDOW.start + DAY_MS },
  ],
  expenses: [
    { id: 'x-first', categoryId: 'rent', amountCents: 1_500_000, spentOn: '2026-09-25', outletId: null, isStockPurchase: false, status: 'recorded', shiftCashMovementId: null },
    { id: 'x-before', categoryId: 'rent', amountCents: 1_400_000, spentOn: '2026-09-24', outletId: null, isStockPurchase: false, status: 'recorded', shiftCashMovementId: null },
    { id: 'x-last', categoryId: 'ice', amountCents: 12_000, spentOn: '2026-10-08', outletId: 'b-0', isStockPurchase: false, status: 'recorded', shiftCashMovementId: null },
    { id: 'x-after', categoryId: 'ice', amountCents: 12_000, spentOn: '2026-10-09', outletId: 'b-0', isStockPurchase: false, status: 'recorded', shiftCashMovementId: null },
    { id: 'x-stock', categoryId: 'ingredients', amountCents: 250_000, spentOn: '2026-10-01', outletId: 'b-0', isStockPurchase: true, status: 'recorded', shiftCashMovementId: null },
  ],
  payouts: [],
}

type Call = { fn: string; args: Record<string, unknown>; as: { role: string; uid: string } }
type Result = { rows?: unknown[]; error?: { code: string; message: string } }

function scopesFor(store: Materialized): Array<{ name: string; scope: ProfitScope; args: Record<string, unknown> }> {
  return [
    { name: 'whole store', scope: { ...WINDOW, outletId: null, unassigned: false }, args: {} },
    { name: 'one branch', scope: { ...WINDOW, outletId: store.branchId, unassigned: false }, args: { p_outlet: store.branchId } },
    { name: 'unassigned', scope: { ...WINDOW, outletId: null, unassigned: true }, args: { p_unassigned: true } },
  ]
}

const iso = (ms: number) => new Date(ms).toISOString()

function storeCalls(store: Materialized): Call[] {
  const owner = { role: 'authenticated', uid: store.ownerId }
  const base = { p_tenant: store.tenantId, p_from: iso(WINDOW.start), p_to: iso(WINDOW.end) }
  return [
    ...scopesFor(store).flatMap(({ args }) => [
      { fn: 'report_profit_summary', args: { ...base, ...args }, as: owner },
      ...PROFIT_GRAINS.map((grain) => ({ fn: 'report_profit_by_period', args: { ...base, ...args, p_grain: grain }, as: owner })),
      { fn: 'report_expenses_by_category', args: { ...base, ...args }, as: owner },
    ]),
    { fn: 'report_profit_summary', args: { ...base, p_to: iso(PARTIAL.end) }, as: owner },
    { fn: 'report_sales_summary', args: base, as: owner },
  ]
}

function runWorker(scenario: unknown): Result[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'report-profit-'))
  try {
    const file = path.join(dir, 'scenario.json')
    writeFileSync(file, JSON.stringify(scenario))
    const output = execFileSync(process.execPath, [WORKER, file], { cwd: process.cwd(), maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' })
    return (JSON.parse(output) as { results: Result[] }).results
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function seedFor(stores: readonly Materialized[]) {
  const all = (table: string) => stores.flatMap((store) => store.seed[table])
  return {
    tenants: stores.map((store) => ({ id: store.tenantId, is_active: true })),
    cutoffs: stores.flatMap((store) =>
      (store.raw.schedule ?? []).map((c) => ({ tenant_id: store.tenantId, effective_from: c.effectiveFrom, cutoff_minutes: c.cutoffMinutes })),
    ),
    users: stores.map((store) => ({ id: store.ownerId })),
    appUsers: stores.map((store) => ({ user_id: store.ownerId, role: 'admin', tenant_id: store.tenantId, is_owner: true, permissions: '{}' })),
    outlets: all('outlets'),
    orders: all('orders'),
    items: all('items'),
    payments: all('payments'),
    dishCosts: all('dishCosts'),
    movements: all('movements'),
    payouts: all('payouts'),
    expenseCategories: all('expenseCategories'),
    expenses: all('expenses'),
  }
}

function rowsOf(result: Result, label: string): unknown[] {
  if (result.error) throw new Error(`${label} failed: ${result.error.code} ${result.error.message}`)
  return result.rows ?? []
}

const inside = (at: number) => at >= WINDOW.start && at < WINDOW.end

/** A non-live order whose sale is in the window and whose void is not. */
function hasSaleCancelledAfterWindow(store: Materialized): boolean {
  const reversed = new Set(store.raw.orders.filter((order) => !isLiveOrder(order)).map((order) => order.id))
  const moves = store.raw.movements.filter((move) => move.orderId !== null && reversed.has(move.orderId))
  return moves.some(
    (sale) => sale.reason === 'sale' && inside(sale.at) && moves.some((back) => back.reason === 'void' && back.orderId === sale.orderId && !inside(back.at)),
  )
}

const byId = <T extends { categoryId: string }>(rows: readonly T[]) => [...rows].sort((a, b) => (a.categoryId < b.categoryId ? -1 : 1))

describe('SQL profit functions = the TypeScript profit engine, to the centavo', () => {
  const runs = Math.min(propertyRuns(), MAX_STORES)
  const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20261022
  const generated = fc.sample(profitStoreArb(SPREAD), { numRuns: runs, seed })
  const uuid = uuidFactory()
  const stores = [EDGE_STORE, ...generated].map((store, index) => materialize(store, index, uuid, seed))
  let results: Result[] = []

  beforeAll(() => {
    results = runWorker({ seed: seedFor(stores), calls: stores.flatMap(storeCalls) })
  }, 900_000)

  test(`hand-built edge cases + ${runs} generated stores (seed ${seed}): every profit figure matches`, () => {
    const perStore = storeCalls(stores[0]).length
    stores.forEach((store, index) => {
      const got = results.slice(index * perStore, (index + 1) * perStore)
      const where = `store ${index} (seed ${seed}; replay with FC_SEED=${seed} FC_NUM_RUNS=${runs})`
      let cursor = 0
      for (const { name, scope } of scopesFor(store)) {
        const raw: ProfitRawInput = { ...store.raw, scope }
        const summary = toProfitFigures(rowsOf(got[cursor++], `${where} ${name} summary`))
        expect({ where, name, summary }).toEqual({ where, name, summary: profitFigures(raw) })
        for (const grain of PROFIT_GRAINS) {
          const periods = toProfitPeriods(rowsOf(got[cursor++], `${where} ${name} ${grain}`))
          expect({ where, name, grain, periods }).toEqual({ where, name, grain, periods: profitFiguresByPeriod(raw, grain) })
        }
        const categories = toExpenseCategoryTotals(rowsOf(got[cursor++], `${where} ${name} categories`))
        expect({ where, name, categories: byId(categories) }).toEqual({ where, name, categories: byId(expensesByCategory(raw)) })
      }
      const partial = toProfitFigures(rowsOf(got[cursor++], `${where} partial`))
      expect({ where, partial }).toEqual({ where, partial: profitFigures({ ...store.raw, scope: { ...PARTIAL, outletId: null, unassigned: false } }) })
      const sales = toSalesTotals(rowsOf(got[cursor++], `${where} sales`))
      const whole = profitFigures({ ...store.raw, scope: { ...WINDOW, outletId: null, unassigned: false } })
      expect({ where, net: whole.netSalesCents, collected: whole.collectedCents, orders: whole.orders }).toEqual({
        where,
        net: sales.netCents,
        collected: sales.collectedCents,
        orders: sales.orders,
      })
    })
  })

  test('the generated stores reach every branch of the rules', () => {
    const wholes = stores.map((store) => profitFigures({ ...store.raw, scope: { ...WINDOW, outletId: null, unassigned: false } }))
    expect(wholes.some((figures) => figures.ledgerCogsCents !== 0)).toBe(true)
    expect(wholes.some((figures) => figures.fallbackCogsCents > 0)).toBe(true)
    expect(wholes.some((figures) => figures.uncostedMovements > 0)).toBe(true)
    expect(wholes.some((figures) => figures.countVarianceCents < 0)).toBe(true)
    expect(wholes.some((figures) => figures.ingredientStockCents > 0)).toBe(true)
    expect(wholes.some((figures) => figures.unsortedPayouts > 0)).toBe(true)
    expect(wholes.some((figures) => figures.groupCents.not_expense > 0)).toBe(true)
    expect(wholes.some((figures) => figures.groupCents.capex > 0)).toBe(true)
    expect(wholes.some((figures) => figures.fallbackOrders > 0 && figures.saleMovements > 0)).toBe(true)
    // An order cancelled later: its sale inside the window, its void after it.
    expect(stores.filter(hasSaleCancelledAfterWindow).length).toBeGreaterThan(1)
  })
})
