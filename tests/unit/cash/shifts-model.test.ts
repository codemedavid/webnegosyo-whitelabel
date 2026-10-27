import { buildShiftRows, remitStatus, salesCellText, salesFigures, shiftSalesTotal } from '@/components/admin/cash/shifts-model'
import { parseRemittance } from '@/lib/cash/remittances'
import { parseShiftSalesReport, type ShiftSalesReport } from '@/lib/cash/shift-sales'
import type { CashShift } from '@/lib/cash/shifts-read'

function report(overrides: Partial<ShiftSalesReport> = {}): ShiftSalesReport {
  return {
    ...parseShiftSalesReport({ source: 'unavailable' }),
    source: 'server',
    summary: {
      orders: 3,
      grossCents: 150000,
      discountCents: 0,
      netCents: 150000,
      serviceChargeCents: 0,
      deliveryCents: 0,
      collectedCents: 150000,
      unpaidCents: 0,
      overpaidCents: 0,
      voidCount: 0,
      voidCents: 0,
      refundCents: 0,
    },
    payments: [
      { key: 'cash', label: 'Cash', cents: 100000, count: 2 },
      { key: 'gcash', label: 'GCash', cents: 50000, count: 1 },
    ],
    ...overrides,
  }
}

function shift(id: string, overrides: Partial<CashShift> = {}): CashShift {
  return {
    id,
    outletId: null,
    staffUserId: null,
    staffName: 'Ana',
    drawerName: 'Cashier 1',
    status: 'closed',
    openingFloatCents: 0,
    expectedCents: 100,
    countedCents: 100,
    openedAt: '2026-10-24T02:00:00.000Z',
    closedAt: '2026-10-24T10:00:00.000Z',
    businessDay: '2026-10-24',
    servicePeriodId: 'p1',
    isBlind: false,
    closeKind: 'counted',
    varianceReason: null,
    isZeroBalance: false,
    closedByName: null,
    ...overrides,
  }
}

describe('salesFigures', () => {
  it('splits cash and non-cash from the shift’s own report', () => {
    expect(salesFigures({ ok: true, data: report() })).toEqual({ kind: 'ready', netCents: 150000, cashCents: 100000, nonCashCents: 50000, receipts: 3 })
  })

  it('never turns a hidden, unavailable, failed or skipped figure into ₱0', () => {
    expect(salesFigures({ ok: true, data: report({ hidden: true, summary: null, payments: null }) }).kind).toBe('hidden')
    expect(salesFigures({ ok: true, data: parseShiftSalesReport({ source: 'unavailable' }) }).kind).toBe('unavailable')
    expect(salesFigures({ ok: false, error: { kind: 'failed', message: 'x' } }).kind).toBe('failed')
    expect(salesFigures(null).kind).toBe('not_loaded')
    expect(salesCellText({ kind: 'hidden', receipts: 2 })).toBe('After count')
    expect(salesCellText({ kind: 'unavailable' })).toBe('Not loaded')
  })
})

describe('buildShiftRows + shiftSalesTotal', () => {
  it('names the service period and adds up only the figures that loaded', () => {
    const rows = buildShiftRows([shift('a'), shift('b', { servicePeriodId: null })], {
      sales: new Map([['a', { ok: true as const, data: report() }]]),
      periodNames: new Map([['p1', 'Day shift']]),
    })

    expect(rows.map((row) => row.periodName)).toEqual(['Day shift', null])
    expect(shiftSalesTotal(rows)).toEqual({ netCents: 150000, isComplete: false })
  })

  it('has no total (null) when nothing loaded', () => {
    const rows = buildShiftRows([shift('a')], { sales: new Map(), periodNames: new Map() })

    expect(shiftSalesTotal(rows)).toEqual({ netCents: null, isComplete: false })
  })
})

describe('remit status and count attempts', () => {
  const base = { id: 'r', tenantId: 't', kind: 'shift', handedOverCents: 634500, createdAt: '2026-10-24T18:50:00.000Z' }

  it('attaches each shift’s remittance and recount, and says "unknown" (null) when attempts could not be read', () => {
    const remittance = parseRemittance({ ...base, status: 'pending', remittedToName: 'Maria' })
    const known = buildShiftRows([shift('a'), shift('b')], {
      sales: new Map(),
      periodNames: new Map(),
      remittances: new Map([['a', remittance]]),
      countAttempts: new Map([['a', 2]]),
    })
    const unknown = buildShiftRows([shift('a')], { sales: new Map(), periodNames: new Map(), countAttempts: null })

    expect(known.map((row) => [row.remittance?.id ?? null, row.countAttempts])).toEqual([['r', 2], [null, 0]])
    expect(unknown[0].countAttempts).toBeNull()
  })

  it('reads every state in words', () => {
    const row = (overrides: Record<string, unknown>) => parseRemittance({ ...base, ...overrides })

    expect(remitStatus(null, true)).toEqual({ text: 'On shift', tone: 'muted' })
    expect(remitStatus(null)).toEqual({ text: 'Not remitted', tone: 'muted' })
    expect(remitStatus(row({ status: 'pending', remittedToName: 'Maria' }))).toEqual({ text: 'Waiting · Maria', tone: 'warn' })
    expect(remitStatus(row({ status: 'pending', toSafe: true }))).toEqual({ text: 'Waiting · Store safe', tone: 'warn' })
    expect(remitStatus(row({ status: 'accepted', receivedCents: 634500, acceptMethod: 'pin' }))).toEqual({ text: 'Accepted · PIN', tone: 'ok' })
    expect(remitStatus(row({ status: 'accepted', receivedCents: 630000, receivedByName: 'Jun', acceptMethod: 'app' }))).toEqual({
      text: 'Got ₱45.00 less · Jun',
      tone: 'warn',
    })
    expect(remitStatus(row({ status: 'disputed' })).text).toBe('Disputed')
    expect(remitStatus(row({ status: 'resolved', resolvedByName: 'Owner' })).text).toBe('Resolved · Owner')
  })
})
