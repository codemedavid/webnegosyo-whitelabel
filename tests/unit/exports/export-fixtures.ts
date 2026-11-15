import fc from 'fast-check'
import { buildReportContext } from '@/lib/reports/read/report-context'
import type { ReportContext } from '@/lib/reports/read/report-context'
import type { ReportRpcClient } from '@/lib/reports/read/report-rpc'
import type { ReportRow, ReportSections } from '@/lib/reports/api/run-report-query'
import { breakdownValues, paymentValues, periodValues, summaryValues } from '@/lib/reports/metrics/compute'
import { bucketPayments } from '@/lib/reports/payment-buckets'
import { rollupItems, rollupPeriods } from '@/lib/reports/sales-breakdowns'
import { summarizeSales, type ReportOrder } from '@/lib/reports/sales-model'
import type { StaffPermissionKey } from '@/lib/staff-permissions'
import type { ExportAccess } from '@/lib/exports/types'
import { reportOrdersArb, toPlatformTables } from '../../fixtures/report-orders'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

export const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
/** Wed 2026-10-14 15:30 Manila. */
export const NOW = Date.parse('2026-10-14T07:30:00Z')
/** The Manila day the order generator places orders in by default. */
export const DAY = { from: '2026-10-01', to: '2026-10-01' } as const

export const owner = { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null }

export function contextFor(searchParams: Record<string, string>, appUser: Parameters<typeof buildReportContext>[0]['appUser'] = owner): ReportContext {
  const state = buildReportContext({
    tenant: { id: TENANT, slug: 'shop', multiBranchEnabled: false, hasConvexDeployment: false },
    backend: 'platform',
    appUser,
    outlets: [],
    searchParams,
    now: NOW,
  })
  if (state.kind !== 'ready') throw new Error(state.kind)
  return state.context
}

export function access(...keys: StaffPermissionKey[]): ExportAccess {
  return { has: (key) => keys.includes(key) }
}

/** A report client that must not be called (row-level sheets read no report function). */
export const noReports: ReportRpcClient = {
  rpc: (fn) => Promise.reject(new Error(`unexpected report call: ${fn}`)),
}

/** The engine's own answer for these orders, in the shape `runReportQuery` returns it. */
export function sectionsFromOrders(orders: readonly ReportOrder[]): ReportSections {
  const totals = summarizeSales(orders)
  const items = rollupItems(orders)
  const itemsSold = items.reduce((sum, row) => sum + row.quantity, 0)
  const periods = rollupPeriods(orders, 'day')
  const payments = bucketPayments(orders)
  const itemRows: ReportRow[] = items.map((row) => ({ key: row.key, label: row.label, values: breakdownValues(row, totals.netCents), categoryLabel: row.categoryLabel, isUnrecorded: row.isUnrecorded }))
  return {
    summary: { ok: true, data: { days: 1, values: summaryValues({ totals, days: 1, itemsSold }), previous: null } },
    periods: { ok: true, data: { grain: 'day', rows: periods.map((row) => ({ key: row.key, label: row.key, values: periodValues(row) })) } },
    items: { ok: true, data: { rows: itemRows } },
    payments: {
      ok: true,
      data: { rows: payments.buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, values: paymentValues(bucket, payments.collectedCents) })) },
    },
  }
}

export interface SeededStore {
  client: ReturnType<typeof fakeSupabaseTables>['client']
  requests: ReturnType<typeof fakeSupabaseTables>['requests']
}

/** The orders as the platform holds them, behind a client that caps every response at `maxRows`. */
export function seedStore(orders: readonly ReportOrder[], extra: Record<string, ReadonlyArray<object>> = {}, maxRows?: number): SeededStore {
  const seed = toPlatformTables(orders, { tenantId: TENANT })
  const fake = fakeSupabaseTables(
    {
      orders: seed.orders,
      order_items: seed.items,
      // The ledger has an id on the platform; the generator's rows don't carry one.
      order_payments: seed.payments.map((payment, index) => ({ id: `p-${String(index).padStart(5, '0')}`, ...payment })),
      staff_shifts: [],
      customers: [],
      ...extra,
    },
    {},
    maxRows === undefined ? {} : { maxRows },
  )
  return { client: fake.client, requests: fake.requests }
}

export const ordersArb = (maxLength = 25): fc.Arbitrary<ReportOrder[]> => reportOrdersArb({ minLength: 1, maxLength })
