/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { loadLedgerPageData, loadLedgerWindow, MAX_LEDGER_ROWS } from '@/lib/gov-discount-reports/load-ledger'
import { resolveReportPeriod } from '@/lib/gov-discount-reports/period'

type Row = Record<string, unknown>
interface Call {
  table: string
  filters: [string, string, unknown][]
  range: [number, number] | null
}

const TENANT = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-10-12T02:00:00.000Z')

function claimRow(overrides: Row = {}): Row {
  return {
    id: 'c',
    outlet_id: null,
    backend: 'platform_supabase',
    external_order_id: 'o',
    order_label: '#1',
    revision: 0,
    event: 'granted',
    claimant_ref: 'r',
    kind: 'senior',
    claimant_name: 'Lola',
    id_number: '123',
    allocation_mode: 'items',
    diners: null,
    vat_status: 'vat',
    gross_share: 112,
    vat_exempt_sales: 100,
    vat_removed: 12,
    discount: 20,
    net_due: 80,
    reduction: 32,
    order_total: 80,
    server_reduction: 32,
    verification: 'verified',
    flags: [],
    granted_by_name: 'Ana',
    approved_by_name: null,
    source: 'pos',
    occurred_at: '2026-10-05T04:00:00.000Z',
    ...overrides,
  }
}

/** A query builder that records its filters and serves `tables`, honouring range(). */
function fakeDb(tables: Record<string, Row[]>, errors: Record<string, string> = {}) {
  const calls: Call[] = []
  const from = (table: string) => {
    const call: Call = { table, filters: [], range: null }
    calls.push(call)
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => (call.filters.push(['eq', column, value]), chain),
      gte: (column: string, value: unknown) => (call.filters.push(['gte', column, value]), chain),
      lt: (column: string, value: unknown) => (call.filters.push(['lt', column, value]), chain),
      order: () => chain,
      limit: () => chain,
      range: (start: number, end: number) => ((call.range = [start, end]), chain),
      then: (resolve: (value: unknown) => unknown) => {
        const rows = tables[table] ?? []
        const data = call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows
        const error = errors[table] ? { message: errors[table] } : null
        return Promise.resolve({ data: error ? null : data, error }).then(resolve)
      },
    }
    return chain
  }
  return { db: { from } as unknown as SupabaseClient<Database>, calls }
}

describe('loadLedgerWindow', () => {
  it('reads the tenant’s half-open Manila window', async () => {
    const period = resolveReportPeriod({ period: 'month' }, NOW)
    const { db, calls } = fakeDb({ gov_discount_claims: [claimRow()] })

    const result = await loadLedgerWindow(db, TENANT, period)

    expect(result.rows).toHaveLength(1)
    expect(result.isTruncated).toBe(false)
    expect(calls[0].filters).toEqual([
      ['eq', 'tenant_id', TENANT],
      ['gte', 'occurred_at', period.startIso],
      ['lt', 'occurred_at', period.endIso],
    ])
  })

  it('pages past the 1000-row API cap and flags a hit ceiling', async () => {
    const rows = Array.from({ length: MAX_LEDGER_ROWS + 10 }, (_, index) => claimRow({ id: `c${index}` }))
    const { db } = fakeDb({ gov_discount_claims: rows })
    const result = await loadLedgerWindow(db, TENANT, resolveReportPeriod({}, NOW))
    expect(result.rows).toHaveLength(MAX_LEDGER_ROWS)
    expect(result.isTruncated).toBe(true)
  })

  it('throws instead of returning a partial book', async () => {
    const { db } = fakeDb({}, { gov_discount_claims: 'permission denied' })
    await expect(loadLedgerWindow(db, TENANT, resolveReportPeriod({}, NOW))).rejects.toThrow('permission denied')
  })
})

describe('loadLedgerPageData', () => {
  it('skips later reversals for a window that has not ended and keeps only this window’s reviews', async () => {
    const { db, calls } = fakeDb({
      gov_discount_claims: [claimRow({ id: 'c1' })],
      gov_discount_reviews: [
        { id: 'r1', claim_id: 'c1', verdict: 'ok', note: null, reviewer_name: 'O', created_at: '2026-10-06T00:00:00Z' },
        { id: 'r2', claim_id: 'elsewhere', verdict: 'ok', note: null, reviewer_name: 'O', created_at: '2026-10-06T00:00:00Z' },
      ],
      outlets: [{ id: 'b1', name: 'Makati' }],
    })

    const data = await loadLedgerPageData(db, TENANT, resolveReportPeriod({ period: 'month' }, NOW), NOW)

    expect(data.laterReversals).toEqual([])
    expect(data.reviews.map((entry) => entry.id)).toEqual(['r1'])
    expect(data.outlets).toEqual([{ id: 'b1', name: 'Makati' }])
    expect(data.hasAnyClaims).toBe(true)
    const claimReads = calls.filter((call) => call.table === 'gov_discount_claims')
    expect(claimReads).toHaveLength(1)
  })

  it('looks for reversals after a past window, and asks whether the store has ANY grant when the window is empty', async () => {
    const { db, calls } = fakeDb({ gov_discount_claims: [], outlets: [] })
    const lastMonth = resolveReportPeriod({ period: 'last_month' }, NOW)

    const data = await loadLedgerPageData(db, TENANT, lastMonth, NOW)

    expect(data.hasAnyClaims).toBe(false)
    const reversalRead = calls.find((call) => call.filters.some(([, column, value]) => column === 'event' && value === 'reversed'))
    expect(reversalRead?.filters).toContainEqual(['gte', 'occurred_at', lastMonth.endIso])
    expect(calls.filter((call) => call.table === 'gov_discount_reviews')).toHaveLength(0)
  })
})
