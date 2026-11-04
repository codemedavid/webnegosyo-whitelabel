/**
 * Bills to pay — schedule properties (contract §3). A due date outside the
 * bill's window, a 31st that isn't a real date, or a paid date shown as still
 * owed would each tell the owner to pay something they don't owe.
 */
import fc from 'fast-check'
import {
  afterDaysAnchor,
  dueDatesBetween,
  occurrencesFor,
  restartOnFor,
  stillToPay,
  validateBillDraft,
  type Bill,
  type BillMark,
  type BillPayment,
  type BillRule,
  type DayOfMonth,
} from '@/lib/expenses/bill-schedule'
import { addDays } from '@/lib/expenses/manila-date'
import { propertyParameters } from '../../utils/property'

const BASE = '2024-01-01'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const dateArb = (min = 0, max = 1500): fc.Arbitrary<string> =>
  fc.integer({ min, max }).map((offset) => addDays(BASE, offset))

const dayArb: fc.Arbitrary<DayOfMonth> = fc.oneof(fc.integer({ min: 1, max: 31 }), fc.constant<'last'>('last'))

const ruleArb: fc.Arbitrary<BillRule> = fc.oneof(
  dayArb.map((day): BillRule => ({ kind: 'monthly', day })),
  fc.tuple(dayArb, dayArb).filter(([a, b]) => a !== b).map(([a, b]): BillRule => ({ kind: 'twice_monthly', days: [a, b] })),
  fc.record({ every: fc.constantFrom<1 | 2>(1, 2), weekday: fc.integer({ min: 0, max: 6 }) }).map((r): BillRule => ({ kind: 'weekly', ...r })),
  fc.record({ every: fc.constantFrom<2 | 3 | 4 | 6 | 12>(2, 3, 4, 6, 12), day: dayArb }).map((r): BillRule => ({ kind: 'months', ...r })),
  fc.integer({ min: 1, max: 90 }).map((every): BillRule => ({ kind: 'after_days', every })),
)

const scheduleArb = fc
  .record({ rule: ruleArb, startsOn: dateArb(0, 900), endGap: fc.option(fc.integer({ min: 0, max: 900 }), { nil: null }) })
  .map(({ rule, startsOn, endGap }) => ({ rule, startsOn, endsOn: endGap === null ? null : addDays(startsOn, endGap) }))

const windowArb = fc.tuple(dateArb(), fc.integer({ min: 0, max: 800 })).map(([from, span]) => ({ from, to: addDays(from, span) }))

function makeBill(overrides: Partial<Bill>): Bill {
  return {
    id: 'bill-1',
    tenantId: 'tenant-1',
    outletId: null,
    name: 'Rent',
    categoryId: 'cat-rent',
    supplierId: null,
    paidToName: null,
    paidFrom: 'cash',
    amountCents: 1_500_000,
    rule: { kind: 'monthly', day: 5 },
    startsOn: BASE,
    endsOn: null,
    remindDaysBefore: 1,
    status: 'active',
    pausedUntil: null,
    pausedOn: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
const isRealDate = (date: string) => DATE_PATTERN.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date

describe('dueDatesBetween (property)', () => {
  test('every date is real, inside the bill window and sorted strictly', () => {
    fc.assert(
      fc.property(scheduleArb, windowArb, fc.option(dateArb(), { nil: undefined }), (schedule, { from, to }, lastPaid) => {
        const dates = dueDatesBetween(schedule, from, to, lastPaid)
        for (const date of dates) {
          expect(isRealDate(date)).toBe(true)
          expect(date >= from && date <= to && date >= schedule.startsOn).toBe(true)
          if (schedule.endsOn !== null) expect(date <= schedule.endsOn).toBe(true)
        }
        expect(dates).toEqual([...new Set(dates)].sort())
      }),
      propertyParameters(),
    )
  })

  test("'last' and days 29–31 land on min(day, the month's last day)", () => {
    fc.assert(
      fc.property(dayArb, dateArb(0, 900), windowArb, (day, startsOn, { from, to }) => {
        const dates = dueDatesBetween({ rule: { kind: 'monthly', day }, startsOn, endsOn: null }, from, to)
        for (const date of dates) {
          const lastDay = daysIn(Number(date.slice(0, 4)), Number(date.slice(5, 7)))
          expect(Number(date.slice(8, 10))).toBe(day === 'last' ? lastDay : Math.min(day, lastDay))
        }
      }),
      propertyParameters(),
    )
  })

  test('twice a month yields exactly two dates in every whole month (for a valid pair)', () => {
    const validPair = fc
      .tuple(dayArb, dayArb)
      .map(([a, b]): BillRule => ({ kind: 'twice_monthly', days: [a, b] }))
      .filter((rule) => validateBillDraft(draftWith(rule), '2024-06-01').ok)
    fc.assert(
      fc.property(validPair, fc.integer({ min: 0, max: 60 }), fc.integer({ min: 1, max: 24 }), (rule, firstMonth, months) => {
        const start = monthStart(monthIndex(BASE) + firstMonth)
        const end = addDays(monthStart(monthIndex(start) + months), -1)
        const dates = dueDatesBetween({ rule, startsOn: start, endsOn: null }, start, end)
        const perMonth = new Map<string, number>()
        for (const date of dates) perMonth.set(date.slice(0, 7), (perMonth.get(date.slice(0, 7)) ?? 0) + 1)
        expect(perMonth.size).toBe(months)
        expect([...perMonth.values()].every((count) => count === 2)).toBe(true)
      }),
      propertyParameters(),
    )
  })

  test('every N months yields one date per N months, counted from the start month', () => {
    const monthsRule = fc.record({ every: fc.constantFrom<2 | 3 | 4 | 6 | 12>(2, 3, 4, 6, 12), day: dayArb })
    fc.assert(
      fc.property(monthsRule, dateArb(0, 900), windowArb, ({ every, day }, startsOn, { from, to }) => {
        const dates = dueDatesBetween({ rule: { kind: 'months', every, day }, startsOn, endsOn: null }, from, to)
        for (const date of dates) expect((monthIndex(date) - monthIndex(startsOn)) % every).toBe(0)
        for (let i = 1; i < dates.length; i += 1) expect(monthIndex(dates[i]) - monthIndex(dates[i - 1])).toBe(every)
      }),
      propertyParameters(),
    )
  })
})

function draftWith(rule: BillRule) {
  return { name: 'Bill', categoryId: 'cat', amountCents: 100, rule, startsOn: '2024-06-01', endsOn: null, remindDaysBefore: 1, paidFrom: 'cash' }
}

function monthStart(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
}

const TODAY_OFFSET_MIN = 200
const billArb = fc
  .record({
    schedule: scheduleArb,
    amountCents: fc.option(fc.integer({ min: 1, max: 5_000_000 }), { nil: null }),
    status: fc.constantFrom<Bill['status']>('active', 'active', 'paused', 'ended'),
    pauseGap: fc.option(fc.integer({ min: -100, max: 100 }), { nil: null }),
    pauseLength: fc.option(fc.integer({ min: 1, max: 120 }), { nil: null }),
  })
  .map(({ schedule, amountCents, status, pauseGap, pauseLength }) => {
    const pausedUntil = status === 'paused' && pauseGap !== null ? addDays(schedule.startsOn, Math.abs(pauseGap)) : null
    return makeBill({
      ...schedule,
      amountCents,
      status,
      pausedUntil,
      // A pause recorded since 2026-10-22 knows when it began; an older one does not.
      pausedOn: status === 'paused' && pauseLength !== null ? addDays(pausedUntil ?? schedule.startsOn, -pauseLength) : null,
    })
  })

const scenarioArb = billArb.chain((bill) =>
  fc.record({
    bill: fc.constant(bill),
    today: dateArb(TODAY_OFFSET_MIN, 1500),
    paidOffsets: fc.array(fc.integer({ min: -120, max: 40 }), { maxLength: 8 }),
    markOffsets: fc.array(fc.tuple(fc.integer({ min: -120, max: 40 }), fc.boolean(), fc.integer({ min: 0, max: 5 })), { maxLength: 6 }),
    amounts: fc.array(fc.integer({ min: 1, max: 5_000_000 }), { minLength: 8, maxLength: 8 }),
  }),
)

function scenario({ bill, today, paidOffsets, markOffsets, amounts }: {
  bill: Bill
  today: string
  paidOffsets: number[]
  markOffsets: [number, boolean, number][]
  amounts: number[]
}) {
  const candidates = dueDatesBetween(bill, addDays(today, -120), addDays(today, 40))
  const pick = (offset: number) => candidates[Math.abs(offset) % Math.max(1, candidates.length)] ?? addDays(today, offset)
  const payments: BillPayment[] = paidOffsets.map((offset, index) => ({
    billId: bill.id,
    dueOn: index % 2 === 0 ? pick(offset) : addDays(today, offset),
    expenseId: `exp-${index}`,
    amountCents: amounts[index],
    spentOn: today,
  }))
  const marks: BillMark[] = markOffsets.map(([offset, isSnooze, snoozeDays]) => ({
    billId: bill.id,
    dueOn: pick(offset),
    kind: isSnooze ? 'snoozed' : 'skipped',
    snoozedUntil: isSnooze ? addDays(today, snoozeDays - 2) : null,
  }))
  return { today, payments, marks }
}

const OPEN = new Set(['late', 'due_today', 'due_soon', 'upcoming', 'snoozed'])

describe('occurrencesFor / stillToPay (property)', () => {
  test('a paid date is never listed as open, not even inside a collapsed late row', () => {
    fc.assert(
      fc.property(scenarioArb, (input) => {
        const ctx = scenario(input)
        const paid = new Set(ctx.payments.map((p) => p.dueOn))
        for (const row of occurrencesFor(input.bill, ctx)) {
          if (!OPEN.has(row.state)) continue
          expect(paid.has(row.dueOn)).toBe(false)
          expect(row.lateDueOns.some((dueOn) => paid.has(dueOn))).toBe(false)
        }
      }),
      propertyParameters(),
    )
  })

  test('at most one late row, and it is the newest late date', () => {
    fc.assert(
      fc.property(scenarioArb, (input) => {
        const rows = occurrencesFor(input.bill, scenario(input))
        const late = rows.filter((row) => row.state === 'late')
        expect(late.length).toBeLessThanOrEqual(1)
        for (const row of late) {
          expect(row.lateCount).toBe(row.lateDueOns.length)
          expect(row.lateDueOns[row.lateDueOns.length - 1]).toBe(row.dueOn)
          expect(row.dueOn < input.today).toBe(true)
        }
      }),
      propertyParameters(),
    )
  })

  test('stillToPay is never negative and equals the sum of the rows it counts', () => {
    fc.assert(
      fc.property(fc.array(scenarioArb, { minLength: 1, maxLength: 4 }), (inputs) => {
        const today = inputs[0].today
        const rows = inputs.flatMap((input, index) => {
          const bill = { ...input.bill, id: `bill-${index}` }
          const ctx = scenario({ ...input, bill, today })
          return occurrencesFor(bill, ctx)
        })
        const monthKey = today.slice(0, 7)
        const counted = rows.filter((row) => OPEN.has(row.state) && (row.state === 'late' || row.dueOn.slice(0, 7) <= monthKey))
        const result = stillToPay(rows, monthKey)
        expect(result.cents).toBeGreaterThanOrEqual(0)
        expect(result.cents).toBe(counted.reduce((sum, row) => sum + (row.amountCents ?? 0) * Math.max(1, row.lateCount), 0))
        expect(result.count).toBe(counted.reduce((sum, row) => sum + Math.max(1, row.lateCount), 0))
      }),
      propertyParameters(),
    )
  })

  test('paused-open-ended and ended bills owe nothing', () => {
    fc.assert(
      fc.property(scenarioArb, fc.constantFrom<'paused' | 'ended'>('paused', 'ended'), (input, status) => {
        const bill = { ...input.bill, status, pausedUntil: null }
        const rows = occurrencesFor(bill, scenario({ ...input, bill }))
        expect(stillToPay(rows, input.today.slice(0, 7))).toMatchObject({ cents: 0, count: 0 })
      }),
      propertyParameters(),
    )
  })
})

describe('pauses, LPG and edits (property)', () => {
  test('no due date inside a timed pause is ever owed', () => {
    fc.assert(
      fc.property(scenarioArb, (input) => {
        const { bill } = input
        if (bill.status !== 'paused' || bill.pausedUntil === null) return
        const pausedOn = bill.pausedOn ?? '0000-01-01'
        for (const row of occurrencesFor(bill, scenario(input))) {
          if (!OPEN.has(row.state)) continue
          for (const dueOn of [row.dueOn, ...row.lateDueOns]) {
            expect(dueOn >= pausedOn && dueOn < bill.pausedUntil).toBe(false)
          }
        }
      }),
      propertyParameters(),
    )
  })

  test('an active "about every N days" bill always shows its one due date, however old', () => {
    const lpgArb = fc.record({ every: fc.integer({ min: 1, max: 90 }), startsOn: dateArb(0, 900) })
    fc.assert(
      fc.property(lpgArb, scenarioArb, ({ every, startsOn }, input) => {
        const bill = makeBill({ rule: { kind: 'after_days', every }, startsOn, status: 'active', pausedUntil: null, pausedOn: null })
        const ctx = scenario({ ...input, bill })
        const anchor = afterDaysAnchor(bill.id, ctx.payments, ctx.marks)
        const due = anchor === null ? startsOn : [addDays(anchor, every), startsOn].sort()[1]
        const isSettled = ctx.payments.some((p) => p.dueOn === due) || ctx.marks.some((m) => m.dueOn === due && m.kind === 'skipped')
        const open = occurrencesFor(bill, ctx).filter((row) => OPEN.has(row.state))
        const isListed = due <= addDays(ctx.today, 31) && !isSettled
        expect(open.map((row) => row.dueOn)).toEqual(isListed ? [due] : [])
      }),
      propertyParameters(),
    )
  })

  test('an edit restarts on a real due date of the new rule, keeps its rhythm and turns nothing late', () => {
    fc.assert(
      fc.property(scenarioArb, (input) => {
        const ctx = scenario(input)
        const edited = { id: input.bill.id, rule: input.bill.rule, startsOn: input.bill.startsOn, endsOn: input.bill.endsOn }
        const restart = restartOnFor(edited, ctx.payments, ctx.marks, ctx.today)
        if (restart === null) {
          // Only an end date with no due date left after today (and after the last settled one).
          expect(edited.endsOn).not.toBeNull()
          if (edited.rule.kind !== 'after_days') {
            const settled = [...ctx.payments.map((p) => p.dueOn), ...ctx.marks.filter((m) => m.kind === 'skipped').map((m) => m.dueOn)]
            const ahead = dueDatesBetween(edited, ctx.today, edited.endsOn as string).filter((d) => settled.every((dueOn) => dueOn < d))
            expect(ahead).toEqual([])
          }
          return
        }
        expect(restart >= ctx.today && restart >= edited.startsOn).toBe(true)
        if (edited.endsOn !== null) expect(restart <= edited.endsOn).toBe(true)
        for (const settled of [...ctx.payments.map((p) => p.dueOn), ...ctx.marks.filter((m) => m.kind === 'skipped').map((m) => m.dueOn)]) {
          expect(restart > settled).toBe(true)
        }
        const moved = { ...edited, startsOn: restart }
        if (edited.rule.kind !== 'after_days') {
          const later = addDays(restart, 800)
          expect(dueDatesBetween(moved, restart, later)).toEqual(dueDatesBetween(edited, restart, later))
        }
        const rows = occurrencesFor(makeBill({ ...moved, status: 'active' }), ctx)
        expect(rows.filter((row) => row.state === 'late')).toEqual([])
      }),
      propertyParameters(),
    )
  })
})
