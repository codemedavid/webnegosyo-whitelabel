/**
 * Bills to pay — the schedule engine (contract §3). Every date is a Manila
 * business date; "today" is Thursday 2026-10-22 unless a test says otherwise.
 */
import {
  BILL_PRESETS,
  billsDue,
  dueDatesBetween,
  estimateCents,
  nextDueDates,
  occurrencesFor,
  ordinal,
  ruleFromColumns,
  ruleSentence,
  ruleToColumns,
  stillToPay,
  validateBillDraft,
  type BillDraft,
  type BillRule,
} from '@/lib/expenses/bill-schedule'
import { TODAY, ctx, makeBill, makeDraft, mark, payment } from './bill-fixtures'
import { seededCategories } from './engine-fixtures'

describe('ruleSentence', () => {
  test.each<[BillRule, string, string]>([
    [{ kind: 'monthly', day: 5 }, TODAY, 'Every month on the 5th'],
    [{ kind: 'monthly', day: 'last' }, TODAY, 'Every month on the last day'],
    [{ kind: 'monthly', day: 1 }, TODAY, 'Every month on the 1st'],
    [{ kind: 'twice_monthly', days: [15, 'last'] }, TODAY, 'Twice a month: 15th and last day'],
    [{ kind: 'twice_monthly', days: ['last', 15] }, TODAY, 'Twice a month: 15th and last day'],
    [{ kind: 'twice_monthly', days: [22, 2] }, TODAY, 'Twice a month: 2nd and 22nd'],
    [{ kind: 'weekly', every: 1, weekday: 2 }, TODAY, 'Every week on Tuesday'],
    [{ kind: 'weekly', every: 2, weekday: 2 }, TODAY, 'Every 2 weeks on Tuesday'],
    [{ kind: 'weekly', every: 1, weekday: 0 }, TODAY, 'Every week on Sunday'],
    [{ kind: 'months', every: 3, day: 10 }, TODAY, 'Every 3 months on the 10th'],
    [{ kind: 'months', every: 6, day: 'last' }, TODAY, 'Every 6 months on the last day'],
    [{ kind: 'months', every: 12, day: 15 }, '2026-03-01', 'Every year on 15 Mar'],
    [{ kind: 'months', every: 12, day: 31 }, '2026-04-01', 'Every year on 30 Apr'],
    [{ kind: 'months', every: 12, day: 29 }, '2027-02-01', 'Every year on 29 Feb'],
    [{ kind: 'months', every: 12, day: 'last' }, '2027-02-01', 'Every year on the last day of Feb'],
    [{ kind: 'after_days', every: 10 }, TODAY, 'About every 10 days after the last one'],
    [{ kind: 'after_days', every: 1 }, TODAY, 'About every day after the last one'],
  ])('%j reads "%s"', (rule, startsOn, expected) => {
    expect(ruleSentence(rule, startsOn)).toBe(expected)
  })

  test('ordinals read like English', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
    ])
  })
})

describe('ruleToColumns / ruleFromColumns', () => {
  test.each<BillRule>([
    { kind: 'monthly', day: 5 },
    { kind: 'monthly', day: 'last' },
    { kind: 'twice_monthly', days: [15, 'last'] },
    { kind: 'weekly', every: 2, weekday: 6 },
    { kind: 'months', every: 12, day: 31 },
    { kind: 'after_days', every: 10 },
  ])('%j survives the round trip', (rule) => {
    expect(ruleFromColumns(ruleToColumns(rule))).toEqual(rule)
  })

  test("stores the month's last day as 0", () => {
    expect(ruleToColumns({ kind: 'twice_monthly', days: [15, 'last'] })).toEqual({
      repeat_kind: 'twice_monthly',
      repeat_every: 1,
      repeat_days: [15, 0],
      repeat_weekday: null,
    })
  })

  test.each([
    { repeat_kind: 'monthly', repeat_every: 1, repeat_days: [5, 6], repeat_weekday: null },
    { repeat_kind: 'monthly', repeat_every: 2, repeat_days: [5], repeat_weekday: null },
    { repeat_kind: 'monthly', repeat_every: 1, repeat_days: [32], repeat_weekday: null },
    { repeat_kind: 'twice_monthly', repeat_every: 1, repeat_days: [15, 15], repeat_weekday: null },
    { repeat_kind: 'weekly', repeat_every: 3, repeat_days: null, repeat_weekday: 2 },
    { repeat_kind: 'weekly', repeat_every: 1, repeat_days: null, repeat_weekday: 7 },
    { repeat_kind: 'weekly', repeat_every: 1, repeat_days: null, repeat_weekday: null },
    { repeat_kind: 'months', repeat_every: 5, repeat_days: [1], repeat_weekday: null },
    { repeat_kind: 'after_days', repeat_every: 91, repeat_days: null, repeat_weekday: null },
    { repeat_kind: 'yearly', repeat_every: 1, repeat_days: [1], repeat_weekday: null },
  ])('refuses the impossible row %j', (row) => {
    expect(() => ruleFromColumns(row)).toThrow(/Impossible bill rule/)
  })

  test('refuses to write an impossible rule', () => {
    expect(() => ruleToColumns({ kind: 'after_days', every: 0 })).toThrow(/Impossible bill rule/)
  })
})

describe('dueDatesBetween', () => {
  const schedule = (rule: BillRule, startsOn = '2026-01-01', endsOn: string | null = null) => ({ rule, startsOn, endsOn })

  test('the 31st falls on the last day of shorter months', () => {
    const dates = dueDatesBetween(schedule({ kind: 'monthly', day: 31 }), '2026-01-01', '2026-06-30')
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30'])
  })

  test("'last' and the 29th land on Feb 29 in a leap year and Feb 28 otherwise", () => {
    const last = schedule({ kind: 'monthly', day: 'last' }, '2027-01-01')
    const the29th = schedule({ kind: 'monthly', day: 29 }, '2027-01-01')
    expect(dueDatesBetween(last, '2027-02-01', '2027-02-28')).toEqual(['2027-02-28'])
    expect(dueDatesBetween(last, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
    expect(dueDatesBetween(the29th, '2027-02-01', '2027-03-31')).toEqual(['2027-02-28', '2027-03-29'])
    expect(dueDatesBetween(the29th, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
  })

  test('twice a month on the 15th and the last day', () => {
    const dates = dueDatesBetween(schedule({ kind: 'twice_monthly', days: [15, 'last'] }), '2027-02-01', '2027-03-31')
    expect(dates).toEqual(['2027-02-15', '2027-02-28', '2027-03-15', '2027-03-31'])
  })

  test('the first due date is on or after the start date', () => {
    const dates = dueDatesBetween(schedule({ kind: 'monthly', day: 5 }, '2026-10-10'), '2026-10-01', '2026-12-31')
    expect(dates).toEqual(['2026-11-05', '2026-12-05'])
  })

  test('every 3 months counts from the start month, even mid-year', () => {
    const quarterly = schedule({ kind: 'months', every: 3, day: 10 }, '2026-07-20')
    expect(dueDatesBetween(quarterly, '2026-01-01', '2027-07-31')).toEqual([
      '2026-10-10',
      '2027-01-10',
      '2027-04-10',
      '2027-07-10',
    ])
  })

  test('every 12 months on the 31st clamps in February of the start month', () => {
    const yearly = schedule({ kind: 'months', every: 12, day: 31 }, '2027-02-01')
    expect(dueDatesBetween(yearly, '2027-01-01', '2029-12-31')).toEqual(['2027-02-28', '2028-02-29', '2029-02-28'])
  })

  test('every week from the first matching weekday', () => {
    const weekly = schedule({ kind: 'weekly', every: 1, weekday: 2 }, TODAY)
    expect(dueDatesBetween(weekly, '2026-10-01', '2026-11-10')).toEqual(['2026-10-27', '2026-11-03', '2026-11-10'])
  })

  test('every 2 weeks alternates from the first Tuesday on or after the start', () => {
    const fortnightly = schedule({ kind: 'weekly', every: 2, weekday: 2 }, TODAY)
    expect(dueDatesBetween(fortnightly, '2026-10-01', '2026-11-30')).toEqual(['2026-10-27', '2026-11-10', '2026-11-24'])
    expect(dueDatesBetween(fortnightly, '2026-11-04', '2026-12-31')).toEqual([
      '2026-11-10',
      '2026-11-24',
      '2026-12-08',
      '2026-12-22',
    ])
  })

  test('after_days is due on the start date until it is first paid', () => {
    const lpg = schedule({ kind: 'after_days', every: 10 }, '2026-10-01')
    expect(dueDatesBetween(lpg, '2026-09-01', '2026-12-31')).toEqual(['2026-10-01'])
  })

  test('after_days is due N days after the last paid due date', () => {
    const lpg = schedule({ kind: 'after_days', every: 10 }, '2026-10-01')
    expect(dueDatesBetween(lpg, '2026-09-01', '2026-12-31', '2026-10-05')).toEqual(['2026-10-15'])
  })

  test('nothing is due after the end date', () => {
    const ending = schedule({ kind: 'monthly', day: 5 }, '2026-01-01', '2026-03-04')
    expect(dueDatesBetween(ending, '2026-01-01', '2026-12-31')).toEqual(['2026-01-05', '2026-02-05'])
  })

  test('an empty window gives no dates', () => {
    expect(dueDatesBetween(schedule({ kind: 'monthly', day: 5 }), '2026-03-10', '2026-03-20')).toEqual([])
  })
})

describe('occurrencesFor', () => {
  test('several late months collapse into the newest with a count', () => {
    // Arrange
    const bill = makeBill()

    // Act
    const rows = occurrencesFor(bill, ctx())

    // Assert
    expect(rows.map((row) => [row.dueOn, row.state])).toEqual([
      ['2026-10-05', 'late'],
      ['2026-11-05', 'upcoming'],
    ])
    expect(rows[0]).toMatchObject({
      lateCount: 3,
      lateDueOns: ['2026-08-05', '2026-09-05', '2026-10-05'],
      daysLate: 17,
      amountCents: 1_500_000,
      isEstimate: false,
    })
    expect(rows[1]).toMatchObject({ lateCount: 0, lateDueOns: [], daysLate: 0 })
  })

  test('late dates older than 92 days drop off', () => {
    const rows = occurrencesFor(makeBill({ startsOn: '2026-01-01' }), ctx())
    expect(rows[0].lateDueOns).toEqual(['2026-08-05', '2026-09-05', '2026-10-05'])
  })

  test("lists this month's paid date with what was paid, never an older one", () => {
    const rows = occurrencesFor(makeBill(), ctx([payment('2026-09-05'), payment('2026-10-05', 1_450_000)]))
    expect(rows.map((row) => [row.dueOn, row.state])).toEqual([
      ['2026-08-05', 'late'],
      ['2026-10-05', 'paid'],
      ['2026-11-05', 'upcoming'],
    ])
    expect(rows[1]).toMatchObject({ amountCents: 1_450_000, payment: { expenseId: 'exp-bill-rent-2026-10-05' } })
    expect(rows[0].lateCount).toBe(1)
  })

  test('a payment linked to a date the rule no longer makes still shows as paid', () => {
    const rows = occurrencesFor(makeBill({ rule: { kind: 'monthly', day: 20 } }), ctx([payment('2026-10-05')]))
    expect(rows.find((row) => row.dueOn === '2026-10-05')?.state).toBe('paid')
  })

  test.each([
    [22, 'due_today'],
    [25, 'due_soon'],
    [26, 'upcoming'],
  ])('a bill due on the %ith is %s', (day, state) => {
    const rows = occurrencesFor(makeBill({ startsOn: '2026-10-01', rule: { kind: 'monthly', day } }), ctx())
    expect(rows[0]).toMatchObject({ dueOn: `2026-10-${day}`, state })
  })

  test('a snoozed date hides until its snooze date, then is late again', () => {
    const bill = makeBill({ startsOn: '2026-10-01', rule: { kind: 'monthly', day: 20 } })
    const snoozed = occurrencesFor(bill, ctx([], [mark('2026-10-20', 'snoozed', '2026-10-23')]))
    const woken = occurrencesFor(bill, ctx([], [mark('2026-10-20', 'snoozed', '2026-10-22')]))
    expect(snoozed[0]).toMatchObject({ dueOn: '2026-10-20', state: 'snoozed', snoozedUntil: '2026-10-23', lateCount: 0 })
    expect(woken[0]).toMatchObject({ dueOn: '2026-10-20', state: 'late', snoozedUntil: null, daysLate: 2 })
  })

  test('a skipped date is never late', () => {
    const bill = makeBill({ startsOn: '2026-10-01' })
    const rows = occurrencesFor(bill, ctx([], [mark('2026-10-05', 'skipped')]))
    expect(rows.map((row) => [row.dueOn, row.state])).toEqual([
      ['2026-10-05', 'skipped'],
      ['2026-11-05', 'upcoming'],
    ])
  })

  test('an open-ended pause lists nothing open but keeps this month’s payment', () => {
    const bill = makeBill({ status: 'paused', pausedUntil: null })
    const rows = occurrencesFor(bill, ctx([payment('2026-10-05')]))
    expect(rows.map((row) => row.state)).toEqual(['paid'])
  })

  test('a pause until a date lists nothing before it and nothing late', () => {
    const bill = makeBill({ status: 'paused', pausedUntil: '2026-11-01' })
    const rows = occurrencesFor(bill, ctx())
    expect(rows.map((row) => [row.dueOn, row.state])).toEqual([['2026-11-05', 'upcoming']])
  })

  test('resuming brings the unpaid dates back', () => {
    const paused = occurrencesFor(makeBill({ status: 'paused', pausedUntil: null }), ctx())
    const resumed = occurrencesFor(makeBill({ status: 'active' }), ctx())
    expect(paused).toEqual([])
    expect(resumed[0]).toMatchObject({ state: 'late', lateCount: 3 })
  })

  test('a pause date already passed acts from that date on', () => {
    const bill = makeBill({ status: 'paused', pausedUntil: '2026-10-01' })
    expect(occurrencesFor(bill, ctx())[0]).toMatchObject({ dueOn: '2026-10-05', state: 'late', lateCount: 1 })
  })

  test('an ended bill lists only its paid ones', () => {
    const bill = makeBill({ status: 'ended' })
    const rows = occurrencesFor(bill, ctx([payment('2026-10-05')], [mark('2026-10-15', 'skipped')]))
    expect(rows.map((row) => row.state)).toEqual(['paid'])
  })

  test('the end date stops future occurrences', () => {
    const rows = occurrencesFor(makeBill({ endsOn: '2026-10-31' }), ctx())
    expect(rows.map((row) => row.dueOn)).toEqual(['2026-10-05'])
  })

  test('after_days is due N days after the last payment', () => {
    const lpg = makeBill({
      id: 'bill-lpg',
      name: 'LPG',
      amountCents: null,
      rule: { kind: 'after_days', every: 10 },
      startsOn: '2026-09-01',
      remindDaysBefore: 1,
    })
    const rows = occurrencesFor(lpg, ctx([payment('2026-10-08', 98_000, 'bill-lpg')]))
    expect(rows.map((row) => [row.dueOn, row.state])).toEqual([
      ['2026-10-08', 'paid'],
      ['2026-10-18', 'late'],
    ])
    expect(rows[1]).toMatchObject({ amountCents: 98_000, isEstimate: true, daysLate: 4, lateCount: 1 })
  })

  test('after_days moves on after "Nothing to pay this time" too', () => {
    const lpg = makeBill({ id: 'bill-lpg', rule: { kind: 'after_days', every: 10 }, startsOn: '2026-10-01' })
    const rows = occurrencesFor(lpg, ctx([], [mark('2026-10-01', 'skipped', null, 'bill-lpg')]))
    expect(rows.map((row) => [row.dueOn, row.state])).toEqual([
      ['2026-10-01', 'skipped'],
      ['2026-10-11', 'late'],
    ])
  })

  test('a bill that changes every time has no amount until it is first paid', () => {
    const rows = occurrencesFor(makeBill({ amountCents: null, startsOn: '2026-10-01', rule: { kind: 'monthly', day: 25 } }), ctx())
    expect(rows[0]).toMatchObject({ amountCents: null, isEstimate: false })
  })
})

describe('estimateCents', () => {
  const varies = makeBill({ amountCents: null })

  test('a fixed amount is the amount', () => {
    expect(estimateCents(makeBill(), [payment('2026-10-05', 1)])).toBe(1_500_000)
  })

  test('no payments: no estimate', () => {
    expect(estimateCents(varies, [])).toBeNull()
  })

  test('one payment, rounded to a whole peso', () => {
    expect(estimateCents(varies, [payment('2026-10-05', 612_345)])).toBe(612_300)
  })

  test('three payments are averaged', () => {
    const payments = [payment('2026-08-05', 600_000), payment('2026-09-05', 610_000), payment('2026-10-05', 650_000)]
    expect(estimateCents(varies, payments)).toBe(620_000)
  })

  test('five payments: only the last three by due date count', () => {
    const payments = [
      payment('2026-10-05', 640_049),
      payment('2026-06-05', 500_000),
      payment('2026-08-05', 610_000),
      payment('2026-07-05', 900_000),
      payment('2026-09-05', 620_000),
    ]
    expect(estimateCents(varies, payments)).toBe(623_300)
  })

  test("another bill's payments never count", () => {
    expect(estimateCents(varies, [payment('2026-10-05', 500_000, 'bill-other')])).toBeNull()
  })
})

describe('billsDue and stillToPay', () => {
  const rent = makeBill()
  const kuryente = makeBill({
    id: 'bill-kuryente',
    name: 'Kuryente',
    categoryId: 'cat-electricity',
    amountCents: null,
    rule: { kind: 'monthly', day: 25 },
    startsOn: '2026-10-01',
  })
  const water = makeBill({ id: 'bill-water', name: 'Tubig', amountCents: 50_000, rule: { kind: 'monthly', day: 25 }, startsOn: '2026-10-01' })
  const paused = makeBill({ id: 'bill-paused', name: 'Pest control', status: 'paused', pausedUntil: null })
  const payments = [payment('2026-09-25', 620_000, 'bill-kuryente')]

  test('sorts late first, then due soon by date and name, then upcoming', () => {
    const rows = billsDue([water, kuryente, paused, rent], ctx(payments))
    expect(rows.map((row) => [row.billId, row.state, row.dueOn])).toEqual([
      ['bill-rent', 'late', '2026-10-05'],
      ['bill-kuryente', 'due_soon', '2026-10-25'],
      ['bill-water', 'due_soon', '2026-10-25'],
      ['bill-rent', 'upcoming', '2026-11-05'],
    ])
  })

  test('adds every late payment, estimates included, and leaves next month out', () => {
    const rows = billsDue([rent, kuryente, water, paused], ctx(payments))
    expect(stillToPay(rows, '2026-10')).toEqual({ cents: 3 * 1_500_000 + 620_000 + 50_000, count: 5, hasEstimate: true })
  })

  test('paid and skipped dates are not still to pay', () => {
    const rows = billsDue([water], ctx([payment('2026-10-25', 50_000, 'bill-water')]))
    const skipped = billsDue([water], ctx([], [mark('2026-10-25', 'skipped', null, 'bill-water')]))
    expect(stillToPay(rows, '2026-10')).toEqual({ cents: 0, count: 0, hasEstimate: false })
    expect(stillToPay(skipped, '2026-10')).toEqual({ cents: 0, count: 0, hasEstimate: false })
  })

  test('a snoozed bill is still to pay', () => {
    const rows = billsDue([water], ctx([], [mark('2026-10-25', 'snoozed', '2026-10-26', 'bill-water')]))
    expect(stillToPay(rows, '2026-10')).toEqual({ cents: 50_000, count: 1, hasEstimate: false })
  })

  test('a bill with no amount yet is flagged as an estimate', () => {
    const rows = billsDue([kuryente], ctx())
    expect(stillToPay(rows, '2026-10')).toEqual({ cents: 0, count: 1, hasEstimate: true })
  })
})

describe('nextDueDates', () => {
  test('previews the next three dates from today', () => {
    expect(nextDueDates(makeBill(), TODAY)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05'])
  })

  test('skips a date already paid ahead', () => {
    expect(nextDueDates(makeBill(), TODAY, 2, [payment('2026-11-05')])).toEqual(['2026-12-05', '2027-01-05'])
  })

  test('previews a yearly bill years ahead', () => {
    const yearly = { rule: { kind: 'months', every: 12, day: 15 } as BillRule, startsOn: '2026-03-01', endsOn: null }
    expect(nextDueDates(yearly, TODAY)).toEqual(['2027-03-15', '2028-03-15', '2029-03-15'])
  })

  test('after_days starts from its next due date, then every N days', () => {
    const lpg = makeBill({ rule: { kind: 'after_days', every: 10 }, startsOn: '2026-09-01' })
    expect(nextDueDates(lpg, TODAY, 3, [payment('2026-10-20')])).toEqual(['2026-10-30', '2026-11-09', '2026-11-19'])
  })

  test('stops at the end date', () => {
    expect(nextDueDates(makeBill({ endsOn: '2026-12-31' }), TODAY)).toEqual(['2026-11-05', '2026-12-05'])
  })
})

describe('validateBillDraft', () => {
  test('a complete draft is fine', () => {
    expect(validateBillDraft(makeDraft(), TODAY)).toEqual({ ok: true })
  })

  test('an amount that changes every time is fine', () => {
    expect(validateBillDraft(makeDraft({ amountCents: null }), TODAY)).toEqual({ ok: true })
  })

  test.each<[string, Partial<BillDraft>, string, string]>([
    ['a blank name', { name: '   ' }, 'name', 'Give the bill a name'],
    ['a long name', { name: 'x'.repeat(61) }, 'name', 'Keep the name to 60 letters or fewer'],
    ['no category', { categoryId: '' }, 'categoryId', 'Pick a category'],
    ['a long payee', { paidToName: 'x'.repeat(81) }, 'paidToName', "Keep who it's paid to to 80 letters or fewer"],
    ['a zero amount', { amountCents: 0 }, 'amountCents', 'Enter an amount from ₱0.01 to ₱10,000,000'],
    ['an amount over the cap', { amountCents: 1_000_000_001 }, 'amountCents', 'Enter an amount from ₱0.01 to ₱10,000,000'],
    ['a fractional amount', { amountCents: 10.5 }, 'amountCents', 'Enter an amount from ₱0.01 to ₱10,000,000'],
    ['the drawer', { paidFrom: 'drawer' }, 'paidFrom', "Bills can't be paid from the drawer yet"],
    ['an unknown source', { paidFrom: 'piggy bank' }, 'paidFrom', 'Pick where the money comes from'],
    ['day 0', { rule: { kind: 'monthly', day: 0 } }, 'rule', 'Pick a day of the month'],
    ['the same day twice', { rule: { kind: 'twice_monthly', days: [15, 15] } }, 'rule', 'Pick two different days of the month'],
    ['days that meet in February', { rule: { kind: 'twice_monthly', days: [28, 'last'] } }, 'rule', 'Pick two days that never fall on the same date'],
    ['every 3 weeks', { rule: { kind: 'weekly', every: 3 as 1, weekday: 2 } }, 'rule', 'Repeat every week or every 2 weeks'],
    ['weekday 7', { rule: { kind: 'weekly', every: 1, weekday: 7 } }, 'rule', 'Pick a day of the week'],
    ['every 5 months', { rule: { kind: 'months', every: 5 as 6, day: 1 } }, 'rule', 'Repeat every 2, 3, 4, 6 or 12 months'],
    ['every 91 days', { rule: { kind: 'after_days', every: 91 } }, 'rule', 'Pick from 1 to 90 days'],
    ['a bad start date', { startsOn: '2026-02-30' }, 'startsOn', 'Pick a start date'],
    ['a start 401 days ago', { startsOn: '2025-09-16' }, 'startsOn', 'Pick a start date within the last 400 days'],
    ['an end before the start', { endsOn: '2026-10-21' }, 'endsOn', "The end date can't be before the start date"],
    ['a bad end date', { endsOn: 'soon' }, 'endsOn', 'Pick an end date'],
    ['remind 15 days before', { remindDaysBefore: 15 }, 'remindDaysBefore', 'Remind 0 to 14 days before'],
  ])('refuses %s', (_label, overrides, field, message) => {
    expect(validateBillDraft(makeDraft(overrides), TODAY)).toEqual({ ok: false, field, message })
  })

  test('a start exactly 400 days ago is fine', () => {
    expect(validateBillDraft(makeDraft({ startsOn: '2025-09-17' }), TODAY)).toEqual({ ok: true })
  })
})

describe('BILL_PRESETS', () => {
  const systemKeys = new Set(seededCategories().map((category) => category.systemKey))

  test.each(BILL_PRESETS.map((preset) => [preset.key, preset] as const))('%s is a valid bill on a seeded category', (_key, preset) => {
    const draft = makeDraft({
      name: preset.name,
      categoryId: `cat-${preset.systemKey}`,
      amountCents: preset.amountMode === 'fixed' ? 100_000 : null,
      rule: preset.rule,
      remindDaysBefore: preset.remindDaysBefore,
    })
    expect(validateBillDraft(draft, TODAY)).toEqual({ ok: true })
    expect(systemKeys.has(preset.systemKey)).toBe(true)
  })

  test('lists the agreed presets in order with their rules', () => {
    expect(BILL_PRESETS.map((p) => [p.key, p.name, p.amountMode, p.remindDaysBefore, p.rule.kind])).toEqual([
      ['rent', 'Rent', 'fixed', 3, 'monthly'],
      ['kuryente', 'Kuryente', 'varies', 1, 'monthly'],
      ['tubig', 'Tubig', 'varies', 1, 'monthly'],
      ['internet', 'Internet', 'fixed', 1, 'monthly'],
      ['lpg', 'LPG', 'varies', 1, 'after_days'],
      ['sahod', 'Sahod', 'fixed', 3, 'twice_monthly'],
      ['government', 'SSS · PhilHealth · Pag-IBIG', 'fixed', 3, 'monthly'],
      ['other', 'Other', 'fixed', 1, 'monthly'],
    ])
    expect(BILL_PRESETS.find((p) => p.key === 'lpg')?.rule).toEqual({ kind: 'after_days', every: 10 })
    expect(BILL_PRESETS.find((p) => p.key === 'sahod')?.rule).toEqual({ kind: 'twice_monthly', days: [15, 'last'] })
  })
})
