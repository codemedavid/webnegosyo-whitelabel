/**
 * The web twin of the shift sales report (CONTRACTS §4, §5): the parser that
 * turns `report_shift_sales` / `report_period_sales` JSON into a typed report,
 * and the two readers that call them through the caller's session client.
 */

import {
  CASH_SALES_FAILED_MESSAGE,
  CASH_SALES_FORBIDDEN_MESSAGE,
  cashAndNonCash,
  isCashPayment,
  parseShiftSalesReport,
  readPeriodSales,
  readShiftSales,
  type CashRpcClient,
} from '@/lib/cash/shift-sales'

const SHIFT_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OUTLET_ID = '33333333-3333-4333-8333-333333333333'

function serverReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: 'server',
    hidden: false,
    window: { from: '2026-10-24T10:00:00.000Z', to: '2026-10-24T18:00:00.000Z' },
    shift: {
      id: SHIFT_ID,
      staffName: 'Ana R.',
      drawerName: 'Cashier 1',
      openedAt: '2026-10-24T10:02:00.000Z',
      closedAt: '2026-10-24T17:41:00.000Z',
      businessDay: '2026-10-24',
      servicePeriodName: 'Day shift',
    },
    summary: {
      orders: 3,
      grossCents: 160000,
      discountCents: 10000,
      netCents: 150000,
      serviceChargeCents: 0,
      deliveryCents: 0,
      collectedCents: 140000,
      unpaidCents: 10000,
      overpaidCents: 0,
      voidCount: 1,
      voidCents: 5000,
      refundCents: 0,
    },
    payments: [
      { key: 'id:cash', label: 'Cash', cents: 90000, count: 2 },
      { key: 'name:gcash', label: 'GCash', cents: 50000, count: 1 },
    ],
    orderTypes: [{ key: 'dine_in', label: 'Dine in', orders: 3, netCents: 150000 }],
    channels: [{ key: 'pos', label: 'Counter', orders: 3, netCents: 150000 }],
    items: [{ label: 'Tapsilog', quantity: 4, netCents: 100000 }],
    receipts: [
      {
        orderId: 'o1',
        number: '#01',
        placedAt: '2026-10-24T10:05:00.000Z',
        orderTypeLabel: 'Dine in',
        methodLabel: 'Cash',
        totalCents: 50000,
        status: 'paid',
      },
    ],
    receiptsTruncated: false,
    firstNumber: '#01',
    lastNumber: '#03',
    ...overrides,
  }
}

function clientReturning(reply: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client: CashRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args })
      return Promise.resolve(reply)
    },
  }
  return { client, calls }
}

describe('parseShiftSalesReport', () => {
  it('reads a full server report into the typed shape', () => {
    // Act
    const report = parseShiftSalesReport(serverReport())

    // Assert
    expect(report.source).toBe('server')
    expect(report.summary?.netCents).toBe(150000)
    expect(report.payments).toHaveLength(2)
    expect(report.receipts[0]).toMatchObject({ number: '#01', totalCents: 50000, status: 'paid' })
    expect(report.shift?.servicePeriodName).toBe('Day shift')
  })

  it('keeps a hidden (blind, still open) report hidden: money is null, never zero', () => {
    const report = parseShiftSalesReport(
      serverReport({
        hidden: true,
        summary: null,
        payments: null,
        orderTypes: null,
        channels: null,
        items: null,
        receipts: [
          {
            orderId: 'o1',
            number: '#01',
            placedAt: '2026-10-24T10:05:00.000Z',
            orderTypeLabel: 'Dine in',
            methodLabel: 'Cash',
            totalCents: null,
            status: 'paid',
          },
        ],
      }),
    )

    expect(report.hidden).toBe(true)
    expect(report.summary).toBeNull()
    expect(report.receipts[0].totalCents).toBeNull()
  })

  it('reads "unavailable" (a store whose orders are not in the platform database) as its own answer', () => {
    const report = parseShiftSalesReport({ source: 'unavailable' })

    expect(report.source).toBe('unavailable')
    expect(report.summary).toBeNull()
    expect(report.receipts).toEqual([])
  })

  it('refuses money that is not whole centavos', () => {
    const broken = serverReport({ summary: { ...(serverReport().summary as object), netCents: 1500.5 } })

    expect(() => parseShiftSalesReport(broken)).toThrow()
  })

  it('refuses a receipt status outside the four the contract names', () => {
    const broken = serverReport({
      receipts: [{ ...(serverReport().receipts as Array<Record<string, unknown>>)[0], status: 'pending' }],
    })

    expect(() => parseShiftSalesReport(broken)).toThrow()
  })

  it('accepts a shift-less window report (By shift / a past period)', () => {
    const report = parseShiftSalesReport(serverReport({ shift: undefined }))

    expect(report.shift).toBeNull()
  })
})

describe('isCashPayment', () => {
  it('uses the payment-buckets type when the report sends it', () => {
    expect(isCashPayment({ label: 'Drawer', type: 'Cash' })).toBe(true)
    expect(isCashPayment({ label: 'Cash', type: 'GCash' })).toBe(false)
  })

  it('else groups the label exactly as payment-buckets does (normalizePayment)', () => {
    expect(isCashPayment({ label: 'Cash' })).toBe(true)
    expect(isCashPayment({ label: 'Cash on delivery' })).toBe(true)
    expect(isCashPayment({ label: 'COD' })).toBe(true)
    expect(isCashPayment({ label: 'GCash' })).toBe(false)
    expect(isCashPayment({ label: 'BPI transfer' })).toBe(false)
  })
})

describe('cashAndNonCash', () => {
  it('splits what came in by the register cash rule, and adds up to collected', () => {
    const report = parseShiftSalesReport(serverReport())

    const split = cashAndNonCash(report)

    expect(split).toEqual({ cashCents: 90000, nonCashCents: 50000 })
  })

  it('is unknown (null), never zero, when the money is hidden or unavailable', () => {
    expect(cashAndNonCash(parseShiftSalesReport({ source: 'unavailable' }))).toBeNull()
    expect(cashAndNonCash(parseShiftSalesReport(serverReport({ hidden: true, payments: null, summary: null })))).toBeNull()
  })
})

describe('readShiftSales', () => {
  it('calls report_shift_sales with the shift id only', async () => {
    const { client, calls } = clientReturning({ data: serverReport(), error: null })

    const result = await readShiftSales(client, SHIFT_ID)

    expect(calls).toEqual([{ fn: 'report_shift_sales', args: { p_shift_id: SHIFT_ID } }])
    expect(result.ok && result.data.summary?.netCents).toBe(150000)
  })

  it('refuses a malformed shift id without calling the database', async () => {
    const { client, calls } = clientReturning({ data: serverReport(), error: null })

    const result = await readShiftSales(client, 'not-a-uuid')

    expect(calls).toHaveLength(0)
    expect(result.ok).toBe(false)
  })

  it('turns 42501 into the access sentence, never Postgres text', async () => {
    const { client } = clientReturning({ data: null, error: { code: '42501', message: 'permission denied for function' } })

    const result = await readShiftSales(client, SHIFT_ID)

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden', message: CASH_SALES_FORBIDDEN_MESSAGE } })
  })

  it('turns any other failure (and a reply that does not parse) into the generic sentence', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const failed = await readShiftSales(clientReturning({ data: null, error: { code: '57014', message: 'canceling statement' } }).client, SHIFT_ID)
    const garbled = await readShiftSales(clientReturning({ data: { source: 'server', hidden: 'no' }, error: null }).client, SHIFT_ID)
    errorSpy.mockRestore()

    expect(failed).toEqual({ ok: false, error: { kind: 'failed', message: CASH_SALES_FAILED_MESSAGE } })
    expect(garbled).toEqual({ ok: false, error: { kind: 'failed', message: CASH_SALES_FAILED_MESSAGE } })
  })

  it('turns a thrown network error into a result, never an exception', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const client: CashRpcClient = { rpc: () => Promise.reject(new Error('fetch failed')) }

    const result = await readShiftSales(client, SHIFT_ID)
    errorSpy.mockRestore()

    expect(result.ok).toBe(false)
  })
})

describe('readPeriodSales', () => {
  it('sends a half-open ISO window and the branch only when one is picked', async () => {
    const { client, calls } = clientReturning({ data: serverReport({ shift: undefined }), error: null })

    await readPeriodSales(client, { tenantId: TENANT_ID, startIso: '2026-10-24T04:00:00.000Z', endIso: '2026-10-24T12:00:00.000Z', outletId: OUTLET_ID })
    await readPeriodSales(client, { tenantId: TENANT_ID, startIso: '2026-10-24T04:00:00.000Z', endIso: '2026-10-24T12:00:00.000Z', outletId: null })

    expect(calls[0]).toEqual({
      fn: 'report_period_sales',
      args: { p_tenant: TENANT_ID, p_from: '2026-10-24T04:00:00.000Z', p_to: '2026-10-24T12:00:00.000Z', p_outlet: OUTLET_ID },
    })
    expect(calls[1].args).not.toHaveProperty('p_outlet')
  })

  it('refuses an empty or backwards window without calling the database', async () => {
    const { client, calls } = clientReturning({ data: serverReport(), error: null })

    const result = await readPeriodSales(client, { tenantId: TENANT_ID, startIso: '2026-10-24T12:00:00.000Z', endIso: '2026-10-24T12:00:00.000Z', outletId: null })

    expect(calls).toHaveLength(0)
    expect(result.ok).toBe(false)
  })

  it('says the Reports key is needed on 42501', async () => {
    const { client } = clientReturning({ data: null, error: { code: '42501', message: 'reports' } })

    const result = await readPeriodSales(client, { tenantId: TENANT_ID, startIso: '2026-10-24T04:00:00.000Z', endIso: '2026-10-24T12:00:00.000Z', outletId: null })

    expect(result.ok === false && result.error.kind).toBe('forbidden')
  })
})
