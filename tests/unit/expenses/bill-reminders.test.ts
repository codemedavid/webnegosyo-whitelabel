/**
 * Bills to pay — phone reminders at 08:00 Manila, bundled per morning (contract §3).
 */
import { billsDue, type Bill, type BillMark, type BillPayment, type BillRule } from '@/lib/expenses/bill-schedule'
import { reminderPlan } from '@/lib/expenses/bill-reminders'
import { TODAY, ctx, makeBill, mark, payment } from './bill-fixtures'

describe('reminderPlan', () => {
  const plan = (bills: Bill[], payments: BillPayment[] = [], marks: BillMark[] = []) =>
    reminderPlan(bills, billsDue(bills, ctx(payments, marks)), TODAY)

  test('reminds the lead days before, the morning after and 3 days after', () => {
    const rent = makeBill({ rule: { kind: 'monthly', day: 25 }, startsOn: '2026-10-01' })
    expect(plan([rent]).map((r) => [r.fireOn, r.kind, r.title])).toEqual([
      ['2026-10-22', 'before', 'Rent is due in 3 days · ₱15,000'],
      ['2026-10-26', 'late1', 'Rent was due yesterday · ₱15,000'],
      ['2026-10-28', 'late3', 'Rent was due 3 days ago · ₱15,000'],
    ])
  })

  test('fires at 08:00 Manila with one id per day', () => {
    const rent = makeBill({ rule: { kind: 'monthly', day: 25 }, startsOn: '2026-10-01' })
    expect(plan([rent])[0]).toMatchObject({ id: 'bill-reminder-2026-10-22', fireAt: '2026-10-22T08:00:00+08:00', billIds: ['bill-rent'] })
  })

  test('a lead of 0 reminds on the day, with an estimate', () => {
    const kuryente = makeBill({
      id: 'bill-kuryente',
      name: 'Kuryente',
      amountCents: null,
      rule: { kind: 'monthly', day: 22 },
      startsOn: '2026-10-01',
      remindDaysBefore: 0,
    })
    const [first] = plan([kuryente], [payment('2026-09-22', 620_000, 'bill-kuryente')])
    expect(first).toMatchObject({ fireOn: TODAY, kind: 'due', title: 'Kuryente is due today · about ₱6,200', body: 'Tap to mark it paid.' })
  })

  test('the morning after a missed date says it plainly', () => {
    const rent = makeBill({ rule: { kind: 'monthly', day: 21 }, startsOn: '2026-10-01' })
    expect(plan([rent]).map((r) => [r.fireOn, r.kind, r.title])).toEqual([
      ['2026-10-22', 'late1', 'Rent was due yesterday · ₱15,000'],
      ['2026-10-24', 'late3', 'Rent was due 3 days ago · ₱15,000'],
    ])
  })

  test('bills that fall on the same morning bundle into one', () => {
    const bills = [
      makeBill({ id: 'b1', name: 'Rent', amountCents: 1_500_000, rule: { kind: 'monthly', day: 24 }, startsOn: '2026-10-01', remindDaysBefore: 2 }),
      makeBill({ id: 'b2', name: 'Kuryente', amountCents: 620_000, rule: { kind: 'monthly', day: 26 }, startsOn: '2026-10-01', remindDaysBefore: 4 }),
      makeBill({ id: 'b3', name: 'Internet', amountCents: 330_000, rule: { kind: 'monthly', day: 28 }, startsOn: '2026-10-01', remindDaysBefore: 6 }),
    ]
    const today = plan(bills).find((r) => r.fireOn === TODAY)
    expect(today).toMatchObject({
      kind: 'before',
      billIds: ['b1', 'b2', 'b3'],
      title: '3 bills this week · ₱24,500',
      body: 'Rent, Kuryente and Internet. Tap to see them.',
    })
  })

  test('a bundle due on the day reads "due today", a mixed one "to pay", with an estimate marked', () => {
    const due = [
      makeBill({ id: 'b1', name: 'Rent', rule: { kind: 'monthly', day: 22 }, startsOn: '2026-10-01', remindDaysBefore: 0 }),
      makeBill({ id: 'b2', name: 'Tubig', amountCents: null, rule: { kind: 'monthly', day: 22 }, startsOn: '2026-10-01', remindDaysBefore: 0 }),
    ]
    const mixed = [
      makeBill({ id: 'b1', name: 'Rent', rule: { kind: 'monthly', day: 21 }, startsOn: '2026-10-01' }),
      makeBill({ id: 'b2', name: 'Tubig', amountCents: 50_000, rule: { kind: 'monthly', day: 25 }, startsOn: '2026-10-01' }),
    ]
    expect(plan(due).find((r) => r.fireOn === TODAY)).toMatchObject({ kind: 'due', title: '2 bills due today · about ₱15,000' })
    expect(plan(mixed).find((r) => r.fireOn === TODAY)).toMatchObject({ kind: 'late1', title: '2 bills to pay · ₱15,500' })
  })

  test('a snoozed bill reminds again on its snooze date and skips the reminders before it', () => {
    const rent = makeBill({ rule: { kind: 'monthly', day: 21 }, startsOn: '2026-10-01' })
    const reminders = plan([rent], [], [mark('2026-10-21', 'snoozed', '2026-10-23')])
    expect(reminders.map((r) => [r.fireOn, r.kind, r.title])).toEqual([
      ['2026-10-23', 'late1', 'Rent was due 2 days ago · ₱15,000'],
      ['2026-10-24', 'late3', 'Rent was due 3 days ago · ₱15,000'],
    ])
  })

  test('a collapsed late bill counts every payment still open', () => {
    const rent = makeBill({ rule: { kind: 'monthly', day: 21 }, startsOn: '2026-09-01' })
    expect(plan([rent])[0]).toMatchObject({ title: 'Rent was due yesterday · ₱30,000', body: '2 payments still open. Tap to see them.' })
  })

  test('paid, skipped, paused and ended bills never remind', () => {
    const due25 = { rule: { kind: 'monthly', day: 25 } as BillRule, startsOn: '2026-10-01' }
    expect(plan([makeBill(due25)], [payment('2026-10-25')])).toEqual([])
    expect(plan([makeBill(due25)], [], [mark('2026-10-25', 'skipped')])).toEqual([])
    expect(plan([makeBill({ ...due25, status: 'paused' })])).toEqual([])
    expect(plan([makeBill({ ...due25, status: 'ended' })])).toEqual([])
  })

  test('only plans within the horizon and never says "missed"', () => {
    const weekly = makeBill({ rule: { kind: 'weekly', every: 1, weekday: 2 }, startsOn: '2026-10-01', remindDaysBefore: 0 })
    const reminders = plan([weekly])
    expect(reminders.every((r) => r.fireOn >= TODAY && r.fireOn <= '2026-11-05')).toBe(true)
    expect(reminders.some((r) => /missed/i.test(`${r.title} ${r.body}`))).toBe(false)
  })
})
