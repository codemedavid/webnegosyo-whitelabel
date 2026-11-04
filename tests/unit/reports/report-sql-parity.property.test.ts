/**
 * @jest-environment node
 *
 * The SQL report functions agree with the TypeScript sales engine to the
 * centavo (plan §7.3 "pinned by a shared fixture", §10.1 invariants 1–6).
 *
 * Generated stores (tests/fixtures/report-orders.ts) are written to a real
 * PostgreSQL (PGlite) as platform rows, with the live RLS slice, the real
 * discount-sync and permission migrations and the report migration loaded.
 * Every report function is called AS EACH STORE'S OWNER (authenticated role,
 * RLS on) and its rows, mapped by the production mappers
 * (src/lib/reports/read/report-rpc-rows.ts), must equal the engine run over
 * the same rows read back through the platform mapper (toReportOrder).
 *
 * PGlite cannot load inside Jest, so the database runs in a child Node process
 * (tests/sql/report-sales-worker.cjs). Stores per run = FC_NUM_RUNS (200 on
 * every change, the nightly job's 5000 capped at MAX_STORES); FC_SEED replays.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fc from 'fast-check'
import { toOrderTypeLabel, toSaleChannel } from '@/lib/dashboard/sale-record'
import { bucketPayments } from '@/lib/reports/payment-buckets'
import type { ReportGrain } from '@/lib/reports/period'
import {
  toCategoryRows,
  toDimensionRows,
  toHourCells,
  toItemRows,
  toPaymentBuckets,
  toPeriodRows,
  toSalesTotals,
} from '@/lib/reports/read/report-rpc-rows'
import { toReportOrder, type PlatformOrderItemRow, type PlatformOrderRow, type PlatformPaymentRow } from '@/lib/reports/read/platform-order-row'
import { rollupCategories, rollupHours, rollupItems, rollupPeriods } from '@/lib/reports/sales-breakdowns'
import type { CutoffChange, CutoffSchedule } from '@/lib/business-day/trading-day'
import { rollupOrders, summarizeSales, type ReportOrder } from '@/lib/reports/sales-model'
import { reportOrdersArb, toPlatformTables, type PlatformOrderSeed } from '../../fixtures/report-orders'
import { propertyRuns } from '../../utils/property'
import { line, order, payment } from './report-fixtures'

const MAX_STORES = 1000
const WORKER = path.join(process.cwd(), 'tests/sql/report-sales-worker.cjs')
/** Two Manila weeks across a month end: day, week, month and hour buckets all split. */
const WINDOW = { start: Date.parse('2026-09-24T16:00:00.000Z'), end: Date.parse('2026-10-08T16:00:00.000Z') }
const GRAINS: readonly ReportGrain[] = ['hour', 'day', 'week', 'month']

/** Sequential UUIDs: order preserved, so lines keep their position when sorted by id. */
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

interface Store {
  tenantId: string
  ownerId: string
  rows: PlatformOrderSeed
  orders: ReportOrder[]
  /** business_day_cutoffs rows (20261027140000): day/week/month + hour weekday follow it. */
  schedule: CutoffSchedule
}

/**
 * A random business-day schedule per store, derived from the run seed: half
 * the stores keep Manila midnight (no rows), the rest get one to three changes
 * around and inside the window, so day buckets of 20 h / 28 h days, a single
 * constant cutoff (the fast path) and mid-window changes are all reached.
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
  for (let i = 0; i < count; i += 1) days.add(next(22)) // 2026-09-20 + 0..21 days
  const base = Date.parse('2026-09-20T00:00:00.000Z')
  return [...days]
    .sort((a, b) => a - b)
    .map((offset): CutoffChange => ({
      effectiveFrom: new Date(base + offset * 86_400_000).toISOString().slice(0, 10),
      cutoffMinutes: next(48) * 15, // 0..705, 15-minute steps
    }))
}

function toStore(generated: ReportOrder[], index: number, uuid: (key: string) => string, seed: number): Store {
  const tenantId = uuid(`tenant:${index}`)
  const raw = toPlatformTables(generated, { tenantId, moneyAsText: index % 2 === 0 })
  const local = (id: string) => uuid(`${index}:${id}`)
  const shared = (id: string | null) => (id === null ? null : uuid(`shared:${id}`))
  const rows: PlatformOrderSeed = {
    orders: raw.orders.map((row) => ({
      ...row,
      id: local(row.id),
      outlet_id: shared(row.outlet_id),
      payment_method_id: shared(row.payment_method_id),
    })),
    items: raw.items.map((row) => ({ ...row, id: local(`${row.order_id}/${row.id}`), order_id: local(row.order_id), menu_item_id: shared(row.menu_item_id) })),
    // The live table refuses a zero amount (CHECK amount > 0).
    payments: raw.payments
      .filter((row) => Number(row.amount) > 0)
      .map((row) => ({ ...row, order_id: local(row.order_id), payment_method_id: shared(row.payment_method_id) })),
  }
  const byId = <T extends { order_id: string }>(list: readonly T[]) =>
    list.reduce((map, row) => map.set(row.order_id, [...(map.get(row.order_id) ?? []), row]), new Map<string, T[]>())
  const items = byId(rows.items)
  const payments = byId(rows.payments)
  const orders = rows.orders.map((row) =>
    toReportOrder(
      row as PlatformOrderRow,
      [...((items.get(row.id) ?? []) as PlatformOrderItemRow[])].sort((a, b) => (a.id < b.id ? -1 : 1)),
      (payments.get(row.id) ?? []) as PlatformPaymentRow[],
    ),
  )
  return { tenantId, ownerId: uuid(`owner:${index}`), rows, orders, schedule: scheduleFor(index, seed) }
}

const at = (hours: number) => WINDOW.start + hours * 60 * 60 * 1000
const discountOf = (total: number) => ({ total, deliveryDiscount: 0, lines: [{ label: 'Promo', amount: total }], allocationsByLine: {} })

/**
 * Hand-built cases a random store reaches too rarely to pin every rule
 * (each was a surviving mutation of the SQL before it was added).
 */
const EDGE_STORE: ReportOrder[] = [
  // Two dishes at the same price, one centavo of drift: the tie goes to the EARLIER line.
  order({ id: 'e1', at: at(1), total: 198.01, lines: [line({ id: 'a', menuItemId: 'd1', name: 'Sisig', subtotal: 99 }), line({ id: 'b', menuItemId: 'd2', name: 'Adobo', subtotal: 99 })] }),
  // One centavo of discount over two equal lines.
  order({
    id: 'e2',
    at: at(2),
    total: 99.99,
    discount: discountOf(0.01),
    lines: [line({ id: 'a', menuItemId: 'd3', name: 'Tea', subtotal: 50 }), line({ id: 'b', menuItemId: 'd4', name: 'Coffee', subtotal: 50 })],
  }),
  // GCash taken and handed straight back: no GCash slice; the bill is settled in cash.
  order({
    id: 'e3',
    at: at(3),
    total: 50,
    paymentStatus: 'paid',
    methodId: null,
    methodName: 'Cash',
    payments: [
      payment({ amount: 50, methodId: 'g', methodName: 'GCash', at: at(3) }),
      payment({ kind: 'refund', amount: 50, methodId: 'g', methodName: 'GCash', at: at(3.5) }),
    ],
  }),
  // A negative line (a correction) weighs nothing.
  order({ id: 'e4', at: at(4), total: 90, lines: [line({ id: 'a', menuItemId: 'd5', name: 'Fix', subtotal: -10 }), line({ id: 'b', menuItemId: 'd6', name: 'Lechon', subtotal: 100 })] }),
  // Stored spellings: a cancelled order written " Cancelled ", a " Paid " status.
  order({ id: 'e5', at: at(5), total: 70, status: ' Cancelled ' }),
  order({ id: 'e6', at: at(6), total: 70, paymentStatus: ' Paid ', methodId: null, methodName: ' Cash ' }),
  // Two methods both called Cash: the name-only Cash orders (e3, e6) join neither.
  order({ id: 'e7', at: at(7), total: 40, paymentStatus: 'paid', methodId: 'k1', methodName: 'Cash' }),
  order({ id: 'e8', at: at(8), total: 30, paymentStatus: 'paid', methodId: 'k2', methodName: 'CASH' }),
  // GCash by id here, by name only there: one GCash row.
  order({ id: 'e9', at: at(9), total: 25, paymentStatus: 'paid', methodId: null, methodName: 'gcash' }),
  // An id paid without a name gives no name to join, even a name-only "Not recorded".
  order({ id: 'e10', at: at(10), total: 30, methodId: null, methodName: 'Card', payments: [payment({ amount: 30, methodId: 'x', methodName: null, at: at(10) })] }),
  order({ id: 'e11', at: at(11), total: 20, paymentStatus: 'paid', methodId: null, methodName: 'Not recorded' }),
]

type Call = { fn: string; args: Record<string, unknown>; as?: { role: string; uid: string | null } }
type Result = { rows?: unknown[]; error?: { code: string; message: string } }

const range = { p_from: new Date(WINDOW.start).toISOString(), p_to: new Date(WINDOW.end).toISOString() }

function storeCalls(store: Store): Call[] {
  const base = { p_tenant: store.tenantId, ...range }
  const owner = { role: 'authenticated', uid: store.ownerId }
  return [
    { fn: 'report_sales_summary', args: base, as: owner },
    ...GRAINS.map((grain) => ({ fn: 'report_sales_by_period', args: { ...base, p_grain: grain }, as: owner })),
    ...['source', 'order_type', 'outlet'].map((dimension) => ({
      fn: 'report_sales_by_dimension',
      args: { ...base, p_dimension: dimension },
      as: owner,
    })),
    { fn: 'report_sales_by_hour', args: base, as: owner },
    { fn: 'report_sales_by_item', args: base, as: owner },
    { fn: 'report_sales_by_category', args: base, as: owner },
    { fn: 'report_payments', args: base, as: owner },
  ]
}

function runWorker(scenario: unknown): Result[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'report-parity-'))
  try {
    const file = path.join(dir, 'scenario.json')
    writeFileSync(file, JSON.stringify(scenario))
    const output = execFileSync(process.execPath, [WORKER, file], { cwd: process.cwd(), maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' })
    return (JSON.parse(output) as { results: Result[] }).results
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function seedFor(stores: readonly Store[]) {
  return {
    tenants: stores.map((store) => ({ id: store.tenantId, is_active: true })),
    cutoffs: stores.flatMap((store) =>
      store.schedule.map((change) => ({ tenant_id: store.tenantId, effective_from: change.effectiveFrom, cutoff_minutes: change.cutoffMinutes })),
    ),
    users: stores.map((store) => ({ id: store.ownerId })),
    appUsers: stores.map((store) => ({ user_id: store.ownerId, role: 'admin', tenant_id: store.tenantId, is_owner: true, permissions: '{}' })),
    orders: stores.flatMap((store) => store.rows.orders),
    items: stores.flatMap((store) => store.rows.items.map(({ tenant_id: _tenant, ...item }) => item)),
    payments: stores.flatMap((store) => store.rows.payments),
  }
}

/** The engine's view of one store, in the shape the mappers produce. */
function expected(store: Store) {
  const totals = summarizeSales(store.orders)
  const { discountByKind: _kinds, ...withoutKinds } = totals
  return {
    summary: withoutKinds,
    periods: GRAINS.map((grain) => rollupPeriods(store.orders, grain, store.schedule)),
    channels: [...rollupOrders(store.orders, (order) => order.channel)].map(([key, row]) => ({ key, ...row })),
    orderTypes: [...rollupOrders(store.orders, (order) => order.orderType)].map(([key, row]) => ({ key, ...row })),
    outlets: [...rollupOrders(store.orders, (order) => order.outletId ?? 'unassigned')].map(([key, row]) => ({ key, ...row })),
    hours: rollupHours(store.orders, store.schedule),
    items: rollupItems(store.orders),
    categories: rollupCategories(store.orders),
    payments: bucketPayments(store.orders).buckets,
  }
}

const byKey = <T extends { key: string }>(rows: readonly T[]) => [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
const withoutLabel = <T extends { label: string }>(rows: readonly T[]) => rows.map(({ label: _label, ...row }) => row)

function actual(results: readonly Result[]) {
  const rows = results.map((result, index) => {
    if (result.error) throw new Error(`call ${index} failed: ${result.error.code} ${result.error.message}`)
    return result.rows
  })
  const [summary, hour, day, week, month, source, orderType, outlet, hours, items, categories, payments] = rows
  return {
    summary: toSalesTotals(summary),
    periods: [hour, day, week, month].map(toPeriodRows),
    channels: toDimensionRows(source, { keyOf: (raw) => toSaleChannel(raw), labelOf: (key) => key }),
    orderTypes: toDimensionRows(orderType, { keyOf: (raw) => toOrderTypeLabel(raw), labelOf: (key) => key }),
    outlets: toDimensionRows(outlet, { keyOf: (raw) => raw ?? 'unassigned', labelOf: (key) => key }),
    hours: toHourCells(hours),
    items: toItemRows(items),
    categories: toCategoryRows(categories).map(({ isFromCurrentMenu: _menu, ...row }) => row),
    payments: toPaymentBuckets(payments),
  }
}

describe('SQL report functions = the TypeScript sales engine, to the centavo', () => {
  const runs = Math.min(propertyRuns(), MAX_STORES)
  const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20261014
  const generated = fc.sample(reportOrdersArb({ minLength: 0, maxLength: 25, window: WINDOW }), { numRuns: runs, seed })
  const uuid = uuidFactory()
  const stores = [EDGE_STORE, ...generated].map((orders, index) => toStore(orders, index, uuid, seed))
  let results: Result[] = []

  beforeAll(() => {
    results = runWorker({ seed: seedFor(stores), calls: stores.flatMap(storeCalls) })
  }, 600_000)

  test(`hand-built edge cases + ${runs} generated stores (seed ${seed}): every report matches`, () => {
    const perStore = storeCalls(stores[0]).length
    stores.forEach((store, index) => {
      const want = expected(store)
      const got = actual(results.slice(index * perStore, (index + 1) * perStore))
      const where = `store ${index} (seed ${seed}; replay with FC_SEED=${seed} FC_NUM_RUNS=${runs})`
      expect({ where, summary: got.summary }).toEqual({ where, summary: want.summary })
      expect({ where, periods: got.periods }).toEqual({ where, periods: want.periods })
      expect({ where, channels: byKey(withoutLabel(got.channels)) }).toEqual({ where, channels: byKey(want.channels) })
      expect({ where, orderTypes: byKey(withoutLabel(got.orderTypes)) }).toEqual({ where, orderTypes: byKey(want.orderTypes) })
      expect({ where, outlets: byKey(withoutLabel(got.outlets)) }).toEqual({ where, outlets: byKey(want.outlets) })
      expect({ where, hours: got.hours }).toEqual({ where, hours: want.hours })
      expect({ where, items: got.items }).toEqual({ where, items: want.items })
      expect({ where, categories: got.categories }).toEqual({ where, categories: want.categories })
      expect({ where, payments: got.payments }).toEqual({ where, payments: want.payments })
    })
  })
})
