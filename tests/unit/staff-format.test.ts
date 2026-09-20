import { formatClock, formatDayLabel, formatLastActive, initialsOf } from '@/lib/staff-activity/staff-format'

describe('formatDayLabel', () => {
  const today = '2026-09-19T02:00:00Z' // 10am Manila on the 19th

  test('names the merchant’s today and yesterday in words', () => {
    expect(formatDayLabel('2026-09-19', today)).toBe('Today')
    expect(formatDayLabel('2026-09-18', today)).toBe('Yesterday')
  })

  test('older days read as a calendar date, weekday first', () => {
    expect(formatDayLabel('2026-09-14', today)).toBe('Mon, 14 Sep 2026')
  })

  test('late-evening Manila is still today, not tomorrow', () => {
    expect(formatDayLabel('2026-09-19', '2026-09-19T15:30:00Z')).toBe('Today')
  })
})

describe('formatLastActive', () => {
  const now = Date.parse('2026-09-19T10:00:00Z')

  test('says so plainly when there is nothing to report', () => {
    expect(formatLastActive(null, now)).toBe('No activity yet')
  })

  test('reads in minutes, hours and days as the gap grows', () => {
    expect(formatLastActive(new Date(now - 30_000).toISOString(), now)).toBe('Just now')
    expect(formatLastActive(new Date(now - 12 * 60_000).toISOString(), now)).toBe('12m ago')
    expect(formatLastActive(new Date(now - 5 * 3_600_000).toISOString(), now)).toBe('5h ago')
    expect(formatLastActive(new Date(now - 3 * 24 * 3_600_000).toISOString(), now)).toBe('3d ago')
  })

  test('beyond a fortnight it gives the date instead of a growing number', () => {
    expect(formatLastActive('2026-08-02T04:00:00Z', now)).toBe('2 Aug 2026')
  })
})

describe('initialsOf', () => {
  test('takes the first letter of the first two words', () => {
    expect(initialsOf('Ana Cruz Santos')).toBe('AC')
  })

  test('falls back to the first letters of a lone word or an email', () => {
    expect(initialsOf('Ana')).toBe('AN')
    expect(initialsOf('ana@example.com')).toBe('AN')
  })

  test('never renders empty', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })
})

describe('formatClock', () => {
  test('reads on the merchant’s clock, whatever the reader’s timezone', () => {
    expect(formatClock('2026-09-19T01:12:00Z')).toBe('9:12 AM')
    expect(formatClock('2026-09-19T13:05:00Z')).toBe('9:05 PM')
  })

  test('midnight and noon are not zero o’clock', () => {
    expect(formatClock('2026-09-18T16:00:00Z')).toBe('12:00 AM')
    expect(formatClock('2026-09-19T04:00:00Z')).toBe('12:00 PM')
  })

  test('a stamp that is not a time says so rather than throwing', () => {
    expect(formatClock('not-a-date')).toBe('—')
  })
})
