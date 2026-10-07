import { buildSubscriptionRoster, type RosterInput } from '@/lib/billing/subscription-roster'
import type { CollectionsInsight } from '@/lib/billing/collections-insight'
import type { PaymentLedgerRow } from '@/lib/billing/payment-history'
import {
  buildCollectionsCalendar,
  dueDayKeyOf,
  parseMonthKey,
  shiftMonthKey,
} from '@/lib/billing/collections-calendar'

/** 2026-10-06 in Manila. */
const NOW = '2026-10-06T04:00:00.000Z'
const TODAY = '2026-10-06'

const roster = (inputs: RosterInput[]) => buildSubscriptionRoster(inputs, NOW)

const insight = (overrides: Partial<CollectionsInsight> = {}): CollectionsInsight => ({
  payment: null,
  activity: null,
  isTrading: false,
  isDormant: false,
  isTradingUnpaid: false,
  hasNeverPaid: false,
  ...overrides,
})

const payment = (tenantId: string, periodStart: string, amount = 649): PaymentLedgerRow => ({
  tenant_id: tenantId,
  amount_php: amount,
  period_start: periodStart,
  period_end: null,
  paid_at: `${periodStart}T02:00:00.000Z`,
  created_at: `${periodStart}T02:00:00.000Z`,
  method: 'gcash',
  reference: null,
})

const build = (
  inputs: RosterInput[],
  options: {
    insights?: Record<string, CollectionsInsight>
    ledger?: PaymentLedgerRow[]
    monthKey?: string
  } = {}
) =>
  buildCollectionsCalendar({
    rows: roster(inputs),
    insights: options.insights,
    ledger: options.ledger,
    monthKey: options.monthKey ?? '2026-10',
    todayKey: TODAY,
  })

const allEntries = (calendar: ReturnType<typeof build>) =>
  calendar.weeks.flat().flatMap((day) => day.entries)

describe('parseMonthKey', () => {
  it('accepts a real YYYY-MM', () => {
    expect(parseMonthKey('2026-11', TODAY)).toBe('2026-11')
  })

  it('falls back to the month of today for anything else', () => {
    expect(parseMonthKey(undefined, TODAY)).toBe('2026-10')
    expect(parseMonthKey('2026-13', TODAY)).toBe('2026-10')
    expect(parseMonthKey('nonsense', TODAY)).toBe('2026-10')
    expect(parseMonthKey(['2026-11'], TODAY)).toBe('2026-10')
  })
})

describe('shiftMonthKey', () => {
  it('crosses year boundaries both ways', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    expect(shiftMonthKey('2026-10', 0)).toBe('2026-10')
  })
})

describe('dueDayKeyOf', () => {
  it('is the first day not paid for', () => {
    const [row] = roster([{ tenantId: 'a', name: 'A', slug: 'a', paidThrough: '2026-10-31' }])
    expect(dueDayKeyOf(row)).toBe('2026-11-01')
  })

  it('is null when nothing has ever been billed', () => {
    const [row] = roster([{ tenantId: 'a', name: 'A', slug: 'a' }])
    expect(dueDayKeyOf(row)).toBeNull()
  })
})

describe('buildCollectionsCalendar', () => {
  it('lays the month out in whole Sunday-first weeks', () => {
    const calendar = build([])

    expect(calendar.monthKey).toBe('2026-10')
    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true)
    // 1 Oct 2026 is a Thursday, so the grid opens on Sunday 27 Sep.
    expect(calendar.weeks[0][0].dayKey).toBe('2026-09-27')
    expect(calendar.weeks[0][0].isInMonth).toBe(false)
    expect(calendar.weeks[0][4].dayKey).toBe('2026-10-01')
    expect(calendar.weeks.at(-1)?.at(-1)?.dayKey).toBe('2026-10-31')
    expect(calendar.weeks.flat().find((day) => day.isToday)?.dayKey).toBe(TODAY)
  })

  it('puts each subscriber on the day their payment falls due', () => {
    const calendar = build([
      { tenantId: 'soon', name: 'Soon Cafe', slug: 'soon', paidThrough: '2026-10-19' },
    ])

    const day = calendar.weeks.flat().find((d) => d.dayKey === '2026-10-20')
    expect(day?.entries).toEqual([
      expect.objectContaining({ tenantId: 'soon', kind: 'upcoming', amountPhp: 649 }),
    ])
  })

  it('marks a payment due today and one already missed', () => {
    const calendar = build([
      { tenantId: 'today', name: 'Today', slug: 'today', paidThrough: '2026-10-05' },
      { tenantId: 'late', name: 'Late', slug: 'late', paidThrough: '2026-10-01' },
    ])

    const byTenant = Object.fromEntries(allEntries(calendar).map((e) => [e.tenantId, e]))
    expect(byTenant.today.kind).toBe('due_today')
    expect(byTenant.late).toEqual(expect.objectContaining({ kind: 'overdue', daysLate: 5 }))
  })

  it('never shows a cancelled client', () => {
    const calendar = build([
      { tenantId: 'gone', name: 'Gone', slug: 'gone', status: 'cancelled', paidThrough: '2026-10-09' },
    ])

    expect(allEntries(calendar)).toHaveLength(0)
    expect(calendar.askNow).toHaveLength(0)
  })

  it('shows a payment already recorded for a period starting this month as paid', () => {
    const calendar = build(
      [{ tenantId: 'paid', name: 'Paid', slug: 'paid', paidThrough: '2026-11-01' }],
      { ledger: [payment('paid', '2026-10-02', 700)] }
    )

    const day = calendar.weeks.flat().find((d) => d.dayKey === '2026-10-02')
    expect(day?.entries).toEqual([
      expect.objectContaining({ tenantId: 'paid', kind: 'paid', amountPhp: 700 }),
    ])
    expect(calendar.totals.paidCount).toBe(1)
    expect(calendar.totals.paidPhp).toBe(700)
  })

  it('flags a due date as a first payment when the client has never paid', () => {
    const calendar = build(
      [{ tenantId: 'new', name: 'New', slug: 'new', paidThrough: '2026-10-14' }],
      { insights: { new: insight({ hasNeverPaid: true }) } }
    )

    expect(allEntries(calendar)[0].isFirstPayment).toBe(true)
  })

  it('does not call it a first payment when the ledger could not be read', () => {
    const calendar = build([{ tenantId: 'x', name: 'X', slug: 'x', paidThrough: '2026-10-14' }])
    expect(allEntries(calendar)[0].isFirstPayment).toBe(false)
  })

  describe('ask now', () => {
    it('lists who is due today, then who is late (longest first), then trading stores never billed', () => {
      const calendar = build(
        [
          { tenantId: 'late1', name: 'Late One', slug: 'l1', paidThrough: '2026-10-03' },
          { tenantId: 'late9', name: 'Late Nine', slug: 'l9', paidThrough: '2026-09-27' },
          { tenantId: 'today', name: 'Today', slug: 'today', paidThrough: '2026-10-05' },
          { tenantId: 'fresh', name: 'Fresh', slug: 'fresh' },
          { tenantId: 'future', name: 'Future', slug: 'future', paidThrough: '2026-10-25' },
        ],
        { insights: { fresh: insight({ isTrading: true, hasNeverPaid: true }) } }
      )

      expect(calendar.askNow.map((e) => e.tenantId)).toEqual(['today', 'late9', 'late1', 'fresh'])
      expect(calendar.askNow.at(-1)).toEqual(
        expect.objectContaining({ kind: 'never_billed', dueDayKey: null, isFirstPayment: true })
      )
    })

    it('moves dormant stores out of the way rather than hiding them', () => {
      const calendar = build(
        [{ tenantId: 'closed', name: 'Closed', slug: 'closed', paidThrough: '2026-08-30' }],
        { insights: { closed: insight({ isDormant: true }) } }
      )

      expect(calendar.askNow).toHaveLength(0)
      expect(calendar.dormantOwing.map((e) => e.tenantId)).toEqual(['closed'])
    })

    it('keeps a late store in ask now when its activity is unknown', () => {
      const calendar = build([
        { tenantId: 'unknown', name: 'Unknown', slug: 'u', paidThrough: '2026-08-30' },
      ])
      expect(calendar.askNow.map((e) => e.tenantId)).toEqual(['unknown'])
    })

    it('leaves never-billed stores out unless they are trading', () => {
      const calendar = build([{ tenantId: 'idle', name: 'Idle', slug: 'idle' }], {
        insights: { idle: insight({ isTrading: false }) },
      })
      expect(calendar.askNow).toHaveLength(0)
      expect(calendar.dormantOwing).toHaveLength(0)
    })
  })

  it('totals what is still to collect in the month and what is already late', () => {
    const calendar = build([
      { tenantId: 'a', name: 'A', slug: 'a', paidThrough: '2026-10-19' },
      { tenantId: 'b', name: 'B', slug: 'b', paidThrough: '2026-10-02', monthlyPricePhp: 999 },
      // Due 1 Nov: on the grid's trailing days only if the grid reaches it.
      { tenantId: 'c', name: 'C', slug: 'c', paidThrough: '2026-10-31' },
    ])

    expect(calendar.totals).toEqual(
      expect.objectContaining({ dueCount: 2, duePhp: 649 + 999, overdueCount: 1, overduePhp: 999 })
    )
  })
})
