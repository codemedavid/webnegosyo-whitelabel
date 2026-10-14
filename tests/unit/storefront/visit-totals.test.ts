import { manilaDate, sumVisits, visitLine } from '@/lib/storefront/visit-totals'

describe('manilaDate', () => {
  test('is the Manila calendar day, not UTC', () => {
    expect(manilaDate(new Date('2026-10-08T16:30:00Z'))).toBe('2026-10-09')
    expect(manilaDate(new Date('2026-10-08T15:30:00Z'))).toBe('2026-10-08')
  })
})

describe('sumVisits', () => {
  const NOW = new Date('2026-10-09T02:00:00Z')

  test('adds every day and picks out today', () => {
    expect(sumVisits([{ day: '2026-10-08', visits: 5 }, { day: '2026-10-09', visits: 3 }], NOW)).toEqual({ total: 8, today: 3 })
  })

  test('no rows is zero, not unknown', () => {
    expect(sumVisits([], NOW)).toEqual({ total: 0, today: 0 })
  })
})

describe('visitLine', () => {
  test.each([
    [{ total: 0, today: 0 }, 'Nobody has opened your store yet. Share your link'],
    [{ total: 1, today: 1 }, '1 person opened your store · 1 today'],
    [{ total: 1240, today: 0 }, '1,240 people opened your store'],
    [{ total: 12, today: 3 }, '12 people opened your store · 3 today'],
  ])('%p → %s', (totals, line) => {
    expect(visitLine(totals)).toBe(line)
  })
})
