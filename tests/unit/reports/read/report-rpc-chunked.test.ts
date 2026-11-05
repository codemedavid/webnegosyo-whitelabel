import {
  REPORT_FAILED_MESSAGE,
  readItems,
  readPeriods,
  readProfitSummary,
  readTotals,
  type ReportChunkCache,
  type ReportRpcClient,
  type ReportWindow,
} from '@/lib/reports/read/report-rpc'

const manila = (wallClock: string): number => Date.parse(`${wallClock}+08:00`)
const NOW = manila('2026-10-14T14:00:00')
const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'

/** Last 12 months: Nov 1 2025 → now, twelve business months. */
const YEAR: ReportWindow = {
  tenantId: TENANT,
  start: manila('2025-11-01T00:00:00'),
  end: NOW,
  branch: { p_outlet: null, p_unassigned: false },
  now: NOW,
}

const summaryRow = (orders: number, netCents: number) => ({
  orders,
  gross_cents: netCents,
  discount_cents: 0,
  delivery_discount_cents: 0,
  refund_cents: 0,
  net_cents: netCents,
  service_cents: 0,
  delivery_cents: 0,
  billed_cents: netCents,
  collected_cents: netCents,
  unpaid_cents: 0,
  overpaid_cents: 0,
  void_orders: 0,
  void_billed_cents: 0,
  orders_without_lines: 0,
  orders_lines_mismatch: 0,
  line_gap_cents: 0,
})

type Reply = { data: unknown; error: { code?: string; message: string } | null }

function fakeClient(reply: (args: Record<string, unknown>, index: number) => Reply) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client: ReportRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args })
      return Promise.resolve(reply(args, calls.length - 1))
    },
  }
  return { client, calls }
}

function memoryCache(): ReportChunkCache & { store: Map<string, unknown>; sets: string[] } {
  const store = new Map<string, unknown>()
  const sets: string[] = []
  return {
    store,
    sets,
    get: (key) => Promise.resolve(store.has(key) ? store.get(key) : null),
    set: (key, value) => {
      sets.push(key)
      store.set(key, value)
      return Promise.resolve()
    },
  }
}

describe('report-rpc — windows longer than one report call', () => {
  let consoleError: jest.SpyInstance
  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => consoleError.mockRestore())

  test('reads a year one business month at a time and adds the months up', async () => {
    const { client, calls } = fakeClient(() => ({ data: [summaryRow(10, 100_000)], error: null }))
    const result = await readTotals(client, YEAR)
    expect(calls).toHaveLength(12)
    expect(calls[0].args).toMatchObject({ p_from: new Date(YEAR.start).toISOString(), p_to: new Date(manila('2025-12-01T00:00:00')).toISOString() })
    expect(calls[11].args).toMatchObject({ p_to: new Date(NOW).toISOString() })
    expect(result).toEqual({ ok: true, data: expect.objectContaining({ orders: 120, netCents: 1_200_000, aovCents: 10_000 }) })
  })

  test('merges a month bucket and an item that appear in several chunks', async () => {
    const { client } = fakeClient((args) => ({
      data: [{ bucket: String(args.p_from).slice(0, 7), orders: 1, gross_cents: 5, discount_cents: 0, net_cents: 5, billed_cents: 5, collected_cents: 5 }],
      error: null,
    }))
    const periods = await readPeriods(client, YEAR, 'month')
    expect(periods.ok && periods.data).toHaveLength(12)

    const items = fakeClient(() => ({
      data: [{ item_key: 'id:x', menu_item_id: 'x', label: 'Tapsilog', category_label: 'Silog', orders: 2, quantity: 3, gross_cents: 300, discount_cents: 0, net_cents: 300, is_unrecorded: false }],
      error: null,
    }))
    const merged = await readItems(items.client, YEAR)
    expect(merged).toEqual({ ok: true, data: [expect.objectContaining({ key: 'id:x', orders: 24, quantity: 36, netCents: 3600 })] })
  })

  test('one failed month fails the whole read instead of showing a partial year', async () => {
    const { client } = fakeClient((_args, index) =>
      index === 5 ? { data: null, error: { code: '57014', message: 'timeout' } } : { data: [summaryRow(1, 100)], error: null },
    )
    expect(await readTotals(client, YEAR)).toEqual({ ok: false, error: { kind: 'failed', message: REPORT_FAILED_MESSAGE } })
  })

  test('a refusal on any month is a refusal', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: '42501', message: 'no' } }))
    const result = await readProfitSummary(client, YEAR)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.kind).toBe('forbidden')
  })

  test('finished months come from the cache on the next read; the running month is always read', async () => {
    const cache = memoryCache()
    const window: ReportWindow = { ...YEAR, cache: { store: cache, scope: 'user-1' } }
    const first = fakeClient(() => ({ data: [summaryRow(1, 100)], error: null }))
    await readTotals(first.client, window)
    expect(first.calls).toHaveLength(12)
    expect(cache.sets).toHaveLength(11)
    expect(cache.sets.every((key) => key.includes('user-1') && key.includes('report_sales_summary'))).toBe(true)

    const second = fakeClient(() => ({ data: [summaryRow(1, 100)], error: null }))
    const result = await readTotals(second.client, window)
    expect(second.calls).toHaveLength(1)
    expect(second.calls[0].args.p_to).toBe(new Date(NOW).toISOString())
    expect(result).toEqual({ ok: true, data: expect.objectContaining({ orders: 12 }) })
  })

  test('another caller, branch or function never reuses a cached month', async () => {
    const cache = memoryCache()
    await readTotals(fakeClient(() => ({ data: [summaryRow(1, 100)], error: null })).client, { ...YEAR, cache: { store: cache, scope: 'user-1' } })
    const other = fakeClient(() => ({ data: [summaryRow(1, 100)], error: null }))
    await readTotals(other.client, { ...YEAR, cache: { store: cache, scope: 'user-2' } })
    expect(other.calls).toHaveLength(12)
    const branch = fakeClient(() => ({ data: [summaryRow(1, 100)], error: null }))
    await readTotals(branch.client, {
      ...YEAR,
      branch: { p_outlet: 'bbbbbbbb-0000-4000-8000-000000000001', p_unassigned: false },
      cache: { store: cache, scope: 'user-1' },
    })
    expect(branch.calls).toHaveLength(12)
  })

  test('a broken cache is skipped, never fatal', async () => {
    const broken: ReportChunkCache = {
      get: () => Promise.reject(new Error('redis down')),
      set: () => Promise.reject(new Error('redis down')),
    }
    const { client, calls } = fakeClient(() => ({ data: [summaryRow(1, 100)], error: null }))
    const result = await readTotals(client, { ...YEAR, cache: { store: broken, scope: 'user-1' } })
    expect(calls).toHaveLength(12)
    expect(result.ok).toBe(true)
  })

  test('a short window is still one call and never cached', async () => {
    const cache = memoryCache()
    const { client, calls } = fakeClient(() => ({ data: [summaryRow(1, 100)], error: null }))
    await readTotals(client, { ...YEAR, start: manila('2026-09-01T00:00:00'), end: manila('2026-10-01T00:00:00'), cache: { store: cache, scope: 'u' } })
    expect(calls).toHaveLength(1)
    expect(cache.sets).toHaveLength(0)
  })
})
