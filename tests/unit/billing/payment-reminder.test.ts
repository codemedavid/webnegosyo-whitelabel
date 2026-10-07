import type { CalendarEntry } from '@/lib/billing/collections-calendar'
import { buildPaymentReminder, formatDueDay } from '@/lib/billing/payment-reminder'

const entry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry => ({
  key: 'due:a',
  tenantId: 'a',
  name: 'Kape Tayo',
  slug: 'kape',
  kind: 'upcoming',
  dueDayKey: '2026-10-09',
  amountPhp: 649,
  daysLate: 0,
  isFirstPayment: false,
  isDormant: false,
  paidThroughDayKey: '2026-10-08',
  anchorDayKey: null,
  monthlyPricePhp: 649,
  ...overrides,
})

describe('formatDueDay', () => {
  it('formats the stored day without shifting it', () => {
    expect(formatDueDay('2026-10-01')).toBe('Oct 1, 2026')
  })
})

describe('buildPaymentReminder', () => {
  it('names the store, the amount and the due date', () => {
    const text = buildPaymentReminder(entry())
    expect(text).toContain('Hi Kape Tayo!')
    expect(text).toContain('₱649')
    expect(text).toContain('is due on Oct 9, 2026')
  })

  it('says a missed payment was due, not is due', () => {
    expect(buildPaymentReminder(entry({ kind: 'overdue', daysLate: 3 }))).toContain(
      'was due on Oct 9, 2026'
    )
  })

  it('says today on the day itself', () => {
    expect(buildPaymentReminder(entry({ kind: 'due_today' }))).toContain('is due today')
  })

  it('calls it the first payment for a client who has never paid', () => {
    expect(buildPaymentReminder(entry({ isFirstPayment: true }))).toContain('your first WebNegosyo')
  })

  it('asks a never-billed store for its first payment without inventing a date', () => {
    const text = buildPaymentReminder(entry({ kind: 'never_billed', dueDayKey: null }))
    expect(text).toContain('first payment')
    expect(text).not.toMatch(/due on/)
  })
})
