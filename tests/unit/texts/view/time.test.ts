import {
  addDays,
  clockText,
  dayHeaderText,
  hourText,
  manilaHhmm,
  manilaInstant,
  manilaToday,
  monthDayText,
  quietWindowText,
  timeAgoText,
  finishText,
  weekdayDateText,
} from '@/lib/texts/view/time'

// 2026-10-14 06:10 UTC = 2:10 PM Wednesday in Manila.
const NOW = Date.parse('2026-10-14T06:10:00Z')

describe('Manila clock and dates', () => {
  test('clockText renders Manila wall time', () => {
    expect(clockText(NOW)).toBe('2:10 PM')
    expect(clockText(Date.parse('2026-10-13T16:05:00Z'))).toBe('12:05 AM')
  })

  test('manilaToday uses the Manila calendar, not UTC', () => {
    expect(manilaToday(Date.parse('2026-10-14T17:00:00Z'))).toBe('2026-10-15')
    expect(manilaToday(NOW)).toBe('2026-10-14')
  })

  test('manilaHhmm and manilaInstant round-trip', () => {
    expect(manilaHhmm(NOW)).toBe('14:10')
    expect(manilaInstant('2026-10-14', '14:10')).toBe(NOW)
  })

  test('addDays moves on the calendar', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  test('weekdayDateText and monthDayText', () => {
    expect(weekdayDateText(NOW)).toBe('Wed, Oct 14')
    expect(monthDayText('2026-10-03')).toBe('Oct 3')
  })

  test('dayHeaderText says Today / Yesterday / a date', () => {
    expect(dayHeaderText(NOW, NOW)).toBe('Today')
    expect(dayHeaderText(NOW - 86_400_000, NOW)).toBe('Yesterday')
    expect(dayHeaderText(NOW - 2 * 86_400_000, NOW)).toBe('Mon, Oct 12')
  })
})

describe('timeAgoText', () => {
  test('recent times', () => {
    expect(timeAgoText(new Date(NOW - 20_000).toISOString(), NOW)).toBe('just now')
    expect(timeAgoText(new Date(NOW - 60_000).toISOString(), NOW)).toBe('1 min ago')
    expect(timeAgoText(new Date(NOW - 12 * 60_000).toISOString(), NOW)).toBe('12 min ago')
    expect(timeAgoText(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe('3 hrs ago')
  })

  test('older times and garbage', () => {
    expect(timeAgoText(new Date(NOW - 86_400_000).toISOString(), NOW)).toBe('Yesterday, 2:10 PM')
    expect(timeAgoText('nope', NOW)).toBe('')
  })

  test('finishText reads a future instant as "around …"', () => {
    expect(finishText(NOW + 3_600_000, NOW)).toBe('around 3:10 PM')
    expect(finishText(NOW + 86_400_000, NOW)).toBe('tomorrow around 2:10 PM')
    expect(finishText(NOW + 2 * 86_400_000, NOW)).toBe('Fri around 2:10 PM')
    expect(finishText(NOW + 9 * 86_400_000, NOW)).toBe('Oct 23 around 2:10 PM')
  })
})

describe('quiet hours text', () => {
  test('hourText and quietWindowText', () => {
    expect(hourText('21:00')).toBe('9pm')
    expect(hourText('07:30')).toBe('7:30am')
    expect(quietWindowText({ quietHoursStart: '21:00', quietHoursEnd: '08:00' })).toBe('9pm–8am')
  })
})
