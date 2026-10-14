import {
  REPORT_FAILED_MESSAGE,
  REPORT_FORBIDDEN_MESSAGE,
  readCategories,
  readDimension,
  readHours,
  readItems,
  readPayments,
  readPeriods,
  readTotals,
  type ReportRpcClient,
  type ReportWindow,
} from '@/lib/reports/read/report-rpc'

const WINDOW: ReportWindow = {
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  start: Date.parse('2026-10-11T16:00:00Z'),
  end: Date.parse('2026-10-12T16:00:00Z'),
  branch: { p_outlet: null, p_unassigned: false },
}

const SUMMARY_ROW = {
  orders: 2,
  gross_cents: 30000,
  discount_cents: 1000,
  delivery_discount_cents: 0,
  refund_cents: 0,
  net_cents: 29000,
  service_cents: 0,
  delivery_cents: 0,
  billed_cents: 29000,
  collected_cents: 20000,
  unpaid_cents: 9000,
  overpaid_cents: 0,
  void_orders: 1,
  void_billed_cents: 5000,
  orders_without_lines: 0,
  orders_lines_mismatch: 0,
  line_gap_cents: 0,
}

type Reply = { data: unknown; error: { code?: string; message: string } | null }

function fakeClient(reply: Reply | ((fn: string) => Reply)) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client: ReportRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args })
      return Promise.resolve(typeof reply === 'function' ? reply(fn) : reply)
    },
  }
  return { client, calls }
}

describe('report-rpc — the platform report functions, called and read', () => {
  let consoleError: jest.SpyInstance
  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => consoleError.mockRestore())

  test('sends the store, the half-open window as ISO instants, and no branch when the whole store is read', async () => {
    const { client, calls } = fakeClient({ data: [SUMMARY_ROW], error: null })
    const result = await readTotals(client, WINDOW)
    expect(calls).toEqual([
      {
        fn: 'report_sales_summary',
        args: { p_tenant: WINDOW.tenantId, p_from: '2026-10-11T16:00:00.000Z', p_to: '2026-10-12T16:00:00.000Z' },
      },
    ])
    expect(result).toMatchObject({ ok: true, data: { netCents: 29000, orders: 2, aovCents: 14500 } })
  })

  test('a branch or the unassigned orders travel as their own arguments', async () => {
    const { client, calls } = fakeClient({ data: [SUMMARY_ROW], error: null })
    await readTotals(client, { ...WINDOW, branch: { p_outlet: 'aaaaaaaa-0000-4000-8000-0000000000a1', p_unassigned: false } })
    await readTotals(client, { ...WINDOW, branch: { p_outlet: null, p_unassigned: true } })
    expect(calls[0].args).toMatchObject({ p_outlet: 'aaaaaaaa-0000-4000-8000-0000000000a1' })
    expect(calls[0].args).not.toHaveProperty('p_unassigned')
    expect(calls[1].args).toMatchObject({ p_unassigned: true })
    expect(calls[1].args).not.toHaveProperty('p_outlet')
  })

  test('each breakdown calls its own function with its own argument', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await readPeriods(client, WINDOW, 'day')
    await readDimension(client, WINDOW, 'order_type', { keyOf: (raw) => raw ?? 'none', labelOf: (key) => key })
    await readHours(client, WINDOW)
    await readItems(client, WINDOW)
    await readCategories(client, WINDOW)
    await readPayments(client, WINDOW)
    expect(calls.map((call) => [call.fn, call.args.p_grain ?? call.args.p_dimension ?? null])).toEqual([
      ['report_sales_by_period', 'day'],
      ['report_sales_by_dimension', 'order_type'],
      ['report_sales_by_hour', null],
      ['report_sales_by_item', null],
      ['report_sales_by_category', null],
      ['report_payments', null],
    ])
  })

  test('a refusal (42501) reads as a permission message, not a crash', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'Sales reports need the Reports permission.' } })
    expect(await readTotals(client, WINDOW)).toEqual({ ok: false, error: { kind: 'forbidden', message: REPORT_FORBIDDEN_MESSAGE } })
  })

  test('a bad range (22023) shows the function’s own sentence', async () => {
    const { client } = fakeClient({ data: null, error: { code: '22023', message: 'A report covers at most 93 days.' } })
    expect(await readTotals(client, WINDOW)).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'A report covers at most 93 days.' },
    })
  })

  test('anything else is a generic failure, logged with its detail, never shown raw', async () => {
    const { client } = fakeClient({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    expect(await readItems(client, WINDOW)).toEqual({ ok: false, error: { kind: 'failed', message: REPORT_FAILED_MESSAGE } })
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('report_sales_by_item'), expect.stringContaining('57014'))
  })

  test('a thrown transport error (timeout) is a failure too', async () => {
    const client: ReportRpcClient = { rpc: () => Promise.reject(new Error('fetch timed out')) }
    expect(await readPayments(client, WINDOW)).toEqual({ ok: false, error: { kind: 'failed', message: REPORT_FAILED_MESSAGE } })
  })

  test('a row in the wrong shape fails loudly instead of reading as ₱0', async () => {
    const { client } = fakeClient({ data: [{ ...SUMMARY_ROW, net_cents: 'lots' }], error: null })
    expect(await readTotals(client, WINDOW)).toEqual({ ok: false, error: { kind: 'failed', message: REPORT_FAILED_MESSAGE } })
  })
})
