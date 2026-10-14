import {
  formatManilaDay,
  formatManilaTime,
  formatPeso,
  formatQuantity,
  formatSignedPeso,
  manilaDayKey,
} from '@/lib/activity/format'

const MINUS = '−'

describe('formatPeso', () => {
  it('drops zero centavos and groups thousands', () => {
    expect(formatPeso(185)).toBe('₱185')
    expect(formatPeso(1234.5)).toBe('₱1,234.50')
    expect(formatPeso(1000000)).toBe('₱1,000,000')
    expect(formatPeso(0)).toBe('₱0')
  })

  it('never renders "₱-185.00": the minus goes before the sign', () => {
    expect(formatPeso(-185)).toBe(`${MINUS}₱185`)
  })

  it('rounds to centavos', () => {
    expect(formatPeso(10.006)).toBe('₱10.01')
    expect(formatPeso(0.004)).toBe('₱0')
  })
})

describe('formatSignedPeso (design spec finding 4)', () => {
  it('uses U+2212 for money out and + for money in', () => {
    expect(formatSignedPeso(-185)).toBe(`${MINUS}₱185`)
    expect(formatSignedPeso(10)).toBe('+₱10')
    expect(formatSignedPeso(-1234.5)).toBe(`${MINUS}₱1,234.50`)
  })

  it('shows zero without a sign', () => {
    expect(formatSignedPeso(0)).toBe('₱0')
    expect(formatSignedPeso(-0.001)).toBe('₱0')
  })
})

describe('Manila time', () => {
  it('formats the wall-clock time in Asia/Manila (UTC+8)', () => {
    expect(formatManilaTime('2026-10-12T04:33:00.000Z')).toBe('12:33 PM')
    expect(formatManilaTime('2026-10-11T16:05:00.000Z')).toBe('12:05 AM')
    expect(formatManilaTime('2026-10-12T01:07:00.000Z')).toBe('9:07 AM')
  })

  it('keys the Manila calendar day', () => {
    expect(manilaDayKey('2026-10-11T16:05:00.000Z')).toBe('2026-10-12')
    expect(manilaDayKey('2026-10-11T15:59:00.000Z')).toBe('2026-10-11')
  })

  it('labels days relative to now', () => {
    const now = '2026-10-12T06:00:00.000Z'
    expect(formatManilaDay('2026-10-12T00:30:00.000Z', now)).toBe('Today')
    expect(formatManilaDay('2026-10-11T03:00:00.000Z', now)).toBe('Yesterday')
    expect(formatManilaDay('2026-10-05T03:00:00.000Z', now)).toBe('Mon 5 Oct')
  })

  it('returns an empty label for an unreadable time', () => {
    expect(formatManilaTime('not a date')).toBe('')
    expect(manilaDayKey('not a date')).toBe('')
  })
})

describe('formatQuantity', () => {
  it('trims trailing zeros', () => {
    expect(formatQuantity(7.6)).toBe('7.6')
    expect(formatQuantity(2)).toBe('2')
    expect(formatQuantity(0.25)).toBe('0.25')
    expect(formatQuantity(1.23456)).toBe('1.235')
  })
})
