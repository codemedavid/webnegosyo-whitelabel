/**
 * @jest-environment node
 *
 * cash.shift_expected (supabase/migrations/20261027130000_shift_expectations.sql)
 * is the server twin of the register's drawer arithmetic: summarizeShiftDrawer
 * + summarizeCashMoves + reconcileShift (webnegosyo-app/lib/shift-drawer.ts,
 * pos-sales.ts, cash-drawers.ts, shift.ts). Before 20261027130100 makes the
 * server figure authoritative, both must agree to the centavo on every arm:
 * cancelled / online / pay-later sales, ledger rows by someone else, refunds,
 * branch in the column or only in the blob, window edges, removed accounts,
 * zero-balance drawers, and method names with NBSP / em space / ZWSP around
 * "cash" (JS \s vs SQL).
 *
 * The app's PURE modules are imported by relative path (their import graph has
 * no React Native). PGlite runs in tests/sql/cash-shift-expected-worker.cjs
 * (Jest cannot load its wasm); scenarios per run = FC_NUM_RUNS, FC_SEED replays.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fc from 'fast-check'
import { propertyRuns } from '../../utils/property'

/*
 * The app's own modules, loaded at RUN time only: a static import makes the
 * web `tsc` follow their import graph into react-native's global types
 * (FormData / fetch), which breaks unrelated web files. Jest resolves them
 * normally; the shapes below are the slice this test uses (checked by the
 * assertions, not by tsc).
 */
interface CounterSale {
  _id: string
  _creationTime: number
  source?: string
  status?: string
  total: number
  paymentMethod?: string
  customerData?: unknown
  amountPaid?: number
  outlet_id?: string
}
interface StaffPayment { orderId: string; kind: 'charge' | 'refund'; amount: number; paymentMethodName?: string; recordedBy?: string; _creationTime?: number }
interface DrawerSummary { saleCount: number; cashTotal: number; nonCashTotal: number; refundsPaid: number }
interface MoveTotals { payIn: number; payOut: number; collected: number }
interface Reconciliation { expectedInDrawer: number; floatToKeep: number }
/* eslint-disable @typescript-eslint/no-require-imports */
const { summarizeShiftDrawer } = require('../../../webnegosyo-app/lib/shift-drawer') as {
  summarizeShiftDrawer: (orders: CounterSale[], payments: StaffPayment[], shift: { outletId: string | null; staffUserId: string; openedAt: string; closedAt: string }, nowMs: number) => DrawerSummary
}
const { summarizeCashMoves } = require('../../../webnegosyo-app/lib/cash-drawers') as {
  summarizeCashMoves: (moves: { kind: string; amount: number }[]) => MoveTotals
}
const { reconcileShift } = require('../../../webnegosyo-app/lib/shift') as {
  reconcileShift: (input: { openingFloat: number; cashCollected: number; moves: MoveTotals; isZeroBalance: boolean }) => Reconciliation
}
/* eslint-enable @typescript-eslint/no-require-imports */

const WORKER = path.join(process.cwd(), 'tests/sql/cash-shift-expected-worker.cjs')
const MAX_SCENARIOS = 2000
const OPENED = Date.parse('2026-10-20T02:00:00.000Z')
const MINUTE = 60_000

const METHODS = ['Cash', 'cash', 'COD', 'GCash', 'Cash on delivery', 'Pay by cash', 'cashless', '  cash ', 'cash ', 'Cash ', 'cash​', 'Maya', 'CASH', null] as const
const SOURCES = ['pos', 'web', 'POS', null] as const
// orders.status is NOT NULL live.
const STATUSES = ['delivered', 'cancelled', 'Cancelled', 'pending', ' cancelled'] as const

interface Ids { tenant: string; outlets: [string, string]; staff: string; other: string; shift: string; drawerless: boolean }

function uuid(prefix: number, n: number): string {
  const hex = (prefix * 1_000_000 + n).toString(16).padStart(12, '0')
  return `${hex.slice(0, 8)}-0000-4000-8000-${hex.padStart(12, '0')}`
}

const centsArb = (max: number) => fc.integer({ min: 0, max }).map((c) => c / 100)
const positiveCentsArb = (max: number) => fc.integer({ min: 1, max }).map((c) => c / 100)
const atArb = fc.integer({ min: -120 * MINUTE, max: 600 * MINUTE }).map((ms) => new Date(OPENED + ms).toISOString())
/** Mostly the likely value, sometimes every other arm. */
function mostly<T>(likely: T, ...others: T[]): fc.Arbitrary<T> {
  return fc.oneof({ arbitrary: fc.constant(likely), weight: 3 }, { arbitrary: fc.constantFrom(likely, ...others), weight: 2 })
}

function scenarioArb(index: number) {
  const ids: Ids = {
    tenant: uuid(1, index), outlets: [uuid(2, index * 2), uuid(2, index * 2 + 1)],
    staff: uuid(3, index * 2), other: uuid(3, index * 2 + 1), shift: uuid(4, index), drawerless: true,
  }
  const [A, B] = ids.outlets
  const outletArb = mostly<string | null>(A, B, null)
  const blobOutletArb = fc.constantFrom<string | undefined>(undefined, A, B, '', ` ${A} `)
  const posArb = fc.oneof(
    fc.constant<unknown>(undefined),
    fc.constant<unknown>([]),
    fc.constant<unknown>('pos'),
    fc.record({
      cashierId: mostly<unknown>(ids.staff, ids.other, '', undefined, 5),
      payLater: fc.constantFrom<unknown>(true, false, 'true', undefined),
    }, { requiredKeys: [] }),
  )
  const orderArb = fc.record({
    outlet_id: outletArb,
    created_at: atArb,
    source: mostly<(typeof SOURCES)[number]>('pos', ...SOURCES),
    status: mostly<(typeof STATUSES)[number]>('delivered', ...STATUSES),
    total: centsArb(500_000),
    payment_method_name: mostly<(typeof METHODS)[number]>('Cash', ...METHODS),
    amount_paid: fc.option(centsArb(500_000), { nil: null }),
    pos: posArb,
    blobOutlet: blobOutletArb,
    payments: fc.array(fc.record({
      kind: fc.constantFrom('charge', 'refund'),
      amount: positiveCentsArb(500_000),
      payment_method_name: fc.constantFrom(...METHODS),
      recorded_by: mostly<string | null>(ids.staff, ids.other, null),
      created_at: atArb,
    }), { maxLength: 3 }),
  })
  return fc.record({
    staffRemoved: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
    shiftOutlet: mostly<string | null>(A, null),
    float: centsArb(500_000),
    isZeroBalance: fc.integer({ min: 0, max: 4 }).map((n) => n === 0),
    untilMs: fc.integer({ min: 0, max: 600 * MINUTE }),
    orders: fc.array(orderArb, { maxLength: 12 }),
    moves: fc.array(fc.record({ kind: fc.constantFrom('collect', 'pay_in', 'pay_out'), amount: positiveCentsArb(1_000_000) }), { maxLength: 4 }),
  }).map((g) => ({ ids, g }))
}

type Generated = ReturnType<typeof scenarioArb> extends fc.Arbitrary<infer T> ? T : never

function toRows({ ids, g }: Generated, index: number) {
  const orders = g.orders.map((o, k) => {
    const blob: Record<string, unknown> = {}
    if (o.pos !== undefined) blob.pos = o.pos
    if (o.blobOutlet !== undefined) blob.outlet_id = o.blobOutlet
    return {
      id: uuid(5, index * 100 + k), tenant_id: ids.tenant, outlet_id: o.outlet_id, created_at: o.created_at, source: o.source,
      status: o.status, total: o.total, payment_method_name: o.payment_method_name, amount_paid: o.amount_paid, customer_data: blob,
    }
  })
  const payments = g.orders.flatMap((o, k) => o.payments.map((p, j) => ({
    id: uuid(6, index * 1000 + k * 10 + j), tenant_id: ids.tenant, order_id: orders[k].id, kind: p.kind, amount: p.amount,
    payment_method_name: p.payment_method_name, recorded_by: p.recorded_by, created_at: p.created_at,
  })))
  const openedAt = new Date(OPENED).toISOString()
  const until = new Date(OPENED + g.untilMs).toISOString()
  return {
    scenario: {
      tenantId: ids.tenant, outletIds: ids.outlets, staffIds: [ids.staff, ids.other],
      shift: { id: ids.shift, staffUserId: g.staffRemoved ? null : ids.staff, outletId: g.shiftOutlet, openingFloat: g.isZeroBalance ? 0 : g.float, isZeroBalance: g.isZeroBalance, openedAt },
      orders, payments, moves: g.moves, until,
    },
    orders, payments, openedAt, until,
  }
}

/** The register's answer, from the rows exactly as the app maps platform rows (backends/supabase-orders.ts). */
function deviceAnswer(built: ReturnType<typeof toRows>) {
  const { scenario, orders, payments, openedAt, until } = built
  const sales: CounterSale[] = orders.map((o) => ({
    _id: o.id, _creationTime: Date.parse(o.created_at), outlet_id: o.outlet_id ?? undefined, customerData: o.customer_data,
    total: o.total, status: o.status, source: o.source ?? undefined, paymentMethod: o.payment_method_name ?? undefined,
    amountPaid: o.amount_paid ?? 0,
  }))
  const ledger: StaffPayment[] = payments.map((p) => ({
    orderId: p.order_id, kind: p.kind as 'charge' | 'refund', amount: p.amount, paymentMethodName: p.payment_method_name ?? undefined,
    recordedBy: p.recorded_by ?? undefined, _creationTime: Date.parse(p.created_at),
  }))
  const summary = summarizeShiftDrawer(sales, ledger, {
    outletId: scenario.shift.outletId, staffUserId: scenario.shift.staffUserId ?? '', openedAt, closedAt: until,
  }, Date.parse(until))
  const moves = summarizeCashMoves(scenario.moves)
  const rec = reconcileShift({ openingFloat: scenario.shift.openingFloat, cashCollected: summary.cashTotal, moves, isZeroBalance: scenario.shift.isZeroBalance })
  // `+ 0` folds JS -0 (Math.round of a tiny negative float) into 0.
  const c = (n: number) => Math.round(n * 100) + 0
  return {
    expectedCents: c(rec.expectedInDrawer), cashSalesCents: c(summary.cashTotal), nonCashCents: c(summary.nonCashTotal),
    refundCents: c(summary.refundsPaid), saleCount: summary.saleCount, payInCents: c(moves.payIn), payOutCents: c(moves.payOut),
    collectedCents: c(moves.collected), floatKeptCents: c(rec.floatToKeep),
  }
}

function runWorker(scenarios: unknown[]): Record<string, unknown>[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'shift-expected-'))
  try {
    const file = path.join(dir, 'scenarios.json')
    writeFileSync(file, JSON.stringify({ scenarios }))
    const output = execFileSync(process.execPath, [WORKER, file], { cwd: process.cwd(), maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' })
    return (JSON.parse(output) as { results: Record<string, unknown>[] }).results
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('cash.shift_expected = the register\'s drawer arithmetic, to the centavo', () => {
  const runs = Math.min(propertyRuns(), MAX_SCENARIOS)
  const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20261027
  const generated = fc.sample(fc.integer({ min: 0, max: 0 }).chain(() => fc.tuple(...Array.from({ length: runs }, (_, i) => scenarioArb(i)))), { numRuns: 1, seed })[0]
  const built = generated.map((g, i) => toRows(g, i))
  let results: Record<string, unknown>[] = []

  beforeAll(() => {
    results = runWorker(built.map((b) => b.scenario))
  }, 600_000)

  test(`${runs} generated shifts (seed ${seed}) agree`, () => {
    expect(results).toHaveLength(built.length)
    built.forEach((b, index) => {
      const want = deviceAnswer(b)
      const r = results[index]
      const got = Object.fromEntries(Object.keys(want).map((key) => [key, r[key]]))
      const where = `scenario ${index} (replay: FC_SEED=${seed} FC_NUM_RUNS=${runs})`
      expect({ where, ...got }).toEqual({ where, ...want })
    })
    // The generator reaches the arms that matter (a silent generator proves nothing).
    const withLedger = built.filter((b) => b.payments.length > 0).length
    const nonZero = results.filter((r) => r.cashSalesCents !== 0).length
    expect(withLedger).toBeGreaterThan(runs / 4)
    expect(nonZero).toBeGreaterThan(runs / 5)
  })
})
